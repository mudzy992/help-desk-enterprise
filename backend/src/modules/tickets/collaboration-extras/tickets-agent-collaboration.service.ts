import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../../authorization/authorization.constants';
import { changeLogActions, changeLogEntityTypes } from '../../change-log/change-log.constants';
import {
  clearFollowerAccessFilter,
  registerFollowerAccessFilter,
} from '../../notifications/fan-out/follower-access-filter';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketMessageRecord } from '../collaboration.types';
import { executeTicketOperation } from '../execute-ticket-operation';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { publishForTicketId } from '../publish-for-ticket-id';
import { recordCollaborationChange } from '../record-collaboration-change';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import { ticketChangeLogReasons } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import {
  AgentCollaborationConfigurationLoader,
  type AgentCollaborationConfiguration,
} from './agent-collaboration-configuration.loader';
import { filterUsersWithStaffAccess } from './filter-users-with-staff-access';
import { parseMentionTokens, rewriteMentionTokens } from './parse-mention-tokens';

/** Paket 2.4 (C6): hard ceiling on followers per ticket. */
export const maxFollowersPerTicket = 50;
const mentionCandidateLimit = 8;
const linkNoteMaxLength = 200;
const staffRoleKeys = [
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
];

export type AgentCollaborationClientConfiguration = Omit<
  AgentCollaborationConfiguration,
  'followOnReply'
>;

export type MentionCandidate = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
};

export type FollowState = {
  readonly following: boolean;
  readonly followerCount: number;
};

export type TicketLinkSide = {
  readonly id: string | null;
  readonly ticketNumber: string;
  /** False: the viewer cannot open it; only the number is shown (D4). */
  readonly accessible: boolean;
  readonly title: string | null;
  readonly status: string | null;
  readonly groupName: string | null;
};

export type TicketLinkResponse = {
  readonly id: string;
  readonly note: string | null;
  readonly createdAt: string;
  readonly createdByName: string | null;
  readonly ticket: TicketLinkSide;
};

export type TicketLinksResponse = {
  readonly links: readonly TicketLinkResponse[];
  /** Read-only structural relations (split parent/children, merge). */
  readonly related: readonly (TicketLinkSide & {
    readonly relation: 'parent' | 'child' | 'mergedInto' | 'mergedChild';
  })[];
  readonly canManage: boolean;
  readonly maxPerTicket: number;
};

/**
 * Paket 2.4 — agent collaboration: following, @mentions and related tickets.
 * Presence lives in `TicketPresenceService` (Redis, no database writes).
 */
@Injectable()
export class TicketsAgentCollaborationService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly configurationLoader: AgentCollaborationConfigurationLoader,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  onModuleInit(): void {
    registerFollowerAccessFilter((ticketId, userIds) =>
      this.filterFollowersWithAccess(ticketId, userIds),
    );
  }

  onModuleDestroy(): void {
    clearFollowerAccessFilter();
  }

  async getClientConfiguration(): Promise<AgentCollaborationClientConfiguration> {
    const { followOnReply: _ignored, ...rest } = await this.configurationLoader.load();
    return rest;
  }

  // ---------------------------------------------------------------- following

  getFollowState(ticketId: string, context: TicketMutationContext): Promise<FollowState> {
    return executeTicketOperation(async () => {
      await this.loadStaffTicket(ticketId, context);
      return this.followState(ticketId, context.actorUserId);
    });
  }

  follow(ticketId: string, context: TicketMutationContext): Promise<FollowState> {
    return executeTicketOperation(async () => {
      const configuration = await this.configurationLoader.load();
      if (!configuration.followersEnabled) {
        throw new TicketsError('FOLLOWERS_DISABLED');
      }
      const ticket = await this.loadStaffTicket(ticketId, context, 'FOLLOW_NOT_ALLOWED');
      await this.addFollower(ticket.id, context.actorUserId, true);
      return this.followState(ticket.id, context.actorUserId);
    });
  }

  unfollow(ticketId: string, context: TicketMutationContext): Promise<FollowState> {
    return executeTicketOperation(async () => {
      // Unfollowing never needs access: someone who lost it must still be able to stop.
      await this.prisma.ticketParticipant.deleteMany({
        where: { ticketId, userId: context.actorUserId, role: 'FOLLOWER' },
      });
      return this.followState(ticketId, context.actorUserId);
    });
  }

  /**
   * C4: `followOnReply` — an agent who writes on a ticket they are not
   * assigned to starts following it. Silent and idempotent; never fails a reply.
   */
  async followOnReply(ticket: TicketRecord, actorUserId: string): Promise<void> {
    try {
      const configuration = await this.configurationLoader.load();
      if (!configuration.followersEnabled || !configuration.followOnReply) {
        return;
      }
      if (ticket.assignedUserId === actorUserId || ticket.requesterId === actorUserId) {
        return;
      }
      await this.addFollower(ticket.id, actorUserId, false);
    } catch {
      // Best effort only.
    }
  }

  private async addFollower(ticketId: string, userId: string, strict: boolean): Promise<void> {
    const existing = await this.prisma.ticketParticipant.findFirst({
      where: { ticketId, userId, role: 'FOLLOWER' },
      select: { id: true },
    });
    if (existing !== null) {
      return;
    }
    const count = await this.prisma.ticketParticipant.count({
      where: { ticketId, role: 'FOLLOWER' },
    });
    if (count >= maxFollowersPerTicket) {
      if (strict) throw new TicketsError('FOLLOWER_LIMIT_REACHED');
      return;
    }
    await this.prisma.ticketParticipant.create({
      data: { ticketId, userId, groupId: null, role: 'FOLLOWER' },
    });
  }

  private async followState(ticketId: string, userId: string): Promise<FollowState> {
    const [mine, followerCount] = await Promise.all([
      this.prisma.ticketParticipant.count({
        where: { ticketId, userId, role: 'FOLLOWER' },
      }),
      this.prisma.ticketParticipant.count({ where: { ticketId, role: 'FOLLOWER' } }),
    ]);
    return { following: mine > 0, followerCount };
  }

  /** C3: followers are notified only while they can still see the ticket. */
  private async filterFollowersWithAccess(
    ticketId: string,
    userIds: readonly string[],
  ): Promise<readonly string[]> {
    try {
      const configuration = await this.configurationLoader.load();
      if (!configuration.followersEnabled) {
        return [];
      }
      const ticket = (await this.prisma.ticket.findUnique({
        where: { id: ticketId },
      })) as TicketRecord | null;
      if (ticket === null) {
        return [];
      }
      return await filterUsersWithStaffAccess(this.prisma, this.authorizationContextLoader, {
        ticket,
        userIds,
        confidential: await this.confidentialConfiguration(userIds[0] ?? ''),
      });
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------- mentions

  listMentionCandidates(
    ticketId: string,
    query: string | undefined,
    context: TicketMutationContext,
  ): Promise<readonly MentionCandidate[]> {
    return executeTicketOperation(async () => {
      const configuration = await this.configurationLoader.load();
      if (!configuration.mentionsEnabled) {
        throw new TicketsError('MENTIONS_DISABLED');
      }
      const ticket = await this.loadStaffTicket(ticketId, context);
      const q = (query ?? '').trim().slice(0, 80);
      const users = await this.prisma.user.findMany({
        where: {
          isActive: true,
          id: { not: context.actorUserId },
          userRoles: { some: { role: { key: { in: staffRoleKeys } } } },
          ...(q.length === 0
            ? {}
            : {
                OR: [
                  { displayName: { contains: q, mode: 'insensitive' as const } },
                  { email: { contains: q, mode: 'insensitive' as const } },
                ],
              }),
        },
        orderBy: { displayName: 'asc' },
        take: 40,
        select: { id: true, displayName: true, email: true },
      });
      // B4: only colleagues who can already see the ticket are offered.
      const allowed = new Set(
        await filterUsersWithStaffAccess(this.prisma, this.authorizationContextLoader, {
          ticket,
          userIds: users.map((user) => user.id),
          confidential: (await this.accessPolicies.bind(context)).confidential,
        }),
      );
      return users.filter((user) => allowed.has(user.id)).slice(0, mentionCandidateLimit);
    });
  }

  /**
   * B3/B4: validates the `@[Name](userId)` tokens of an internal note before it
   * is stored. Unknown or non-staff users become plain text; active staff who
   * cannot see the ticket reject the note with `MENTION_NO_ACCESS`.
   */
  async prepareNoteMentions(
    ticket: TicketRecord,
    body: string,
    context: TicketMutationContext,
  ): Promise<{ readonly body: string; readonly userIds: readonly string[] }> {
    const tokens = parseMentionTokens(body);
    if (tokens.length === 0) {
      return { body, userIds: [] };
    }
    const configuration = await this.configurationLoader.load();
    if (!configuration.mentionsEnabled) {
      return { body: rewriteMentionTokens(body, new Set()), userIds: [] };
    }
    const staff = await this.prisma.user.findMany({
      where: {
        id: { in: tokens.map((token) => token.userId) },
        isActive: true,
        userRoles: { some: { role: { key: { in: staffRoleKeys } } } },
      },
      select: { id: true, displayName: true },
    });
    const staffIds = staff.map((user) => user.id).filter((id) => id !== context.actorUserId);
    const allowed = new Set(
      await filterUsersWithStaffAccess(this.prisma, this.authorizationContextLoader, {
        ticket,
        userIds: staffIds,
        confidential: context.confidential,
      }),
    );
    const denied = staff.filter((user) => staffIds.includes(user.id) && !allowed.has(user.id));
    if (denied.length > 0) {
      throw new TicketsError('MENTION_NO_ACCESS', 'MENTION_NO_ACCESS', {
        names: denied.map((user) => user.displayName),
      });
    }
    const keep = new Set([...allowed]);
    return { body: rewriteMentionTokens(body, keep), userIds: [...keep] };
  }

  async recordNoteMentions(
    message: TicketMessageRecord,
    userIds: readonly string[],
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    await this.prisma.ticketMessageMention.createMany({
      data: userIds.map((userId) => ({
        messageId: message.id,
        ticketId: message.ticketId,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  // ---------------------------------------------------------------- links

  listLinks(ticketId: string, context: TicketMutationContext): Promise<TicketLinksResponse> {
    return executeTicketOperation(async () => {
      const configuration = await this.configurationLoader.load();
      const ticket = await this.loadStaffTicket(ticketId, context);
      const canManage = configuration.linksEnabled && (await this.canManageLinks(context));
      const [rows, children, mergedChildren] = await Promise.all([
        configuration.linksEnabled
          ? this.prisma.ticketLink.findMany({
              where: { OR: [{ ticketAId: ticket.id }, { ticketBId: ticket.id }] },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                ticketAId: true,
                ticketBId: true,
                note: true,
                createdAt: true,
                createdBy: { select: { displayName: true } },
              },
            })
          : Promise.resolve([]),
        this.prisma.ticket.findMany({
          where: { parentTicketId: ticket.id },
          select: { id: true },
          take: 50,
        }),
        this.prisma.ticket.findMany({
          where: { mergedIntoTicketId: ticket.id },
          select: { id: true },
          take: 50,
        }),
      ]);
      const otherIds = rows.map((row) => (row.ticketAId === ticket.id ? row.ticketBId : row.ticketAId));
      const relatedIds: { id: string; relation: 'parent' | 'child' | 'mergedInto' | 'mergedChild' }[] = [
        ...(ticket.parentTicketId === null ? [] : [{ id: ticket.parentTicketId, relation: 'parent' as const }]),
        ...children.map((row) => ({ id: row.id, relation: 'child' as const })),
        ...(ticket.mergedIntoTicketId === null
          ? []
          : [{ id: ticket.mergedIntoTicketId, relation: 'mergedInto' as const }]),
        ...mergedChildren.map((row) => ({ id: row.id, relation: 'mergedChild' as const })),
      ];
      const sides = await this.describeTickets(
        [...otherIds, ...relatedIds.map((item) => item.id)],
        context,
      );
      return {
        links: rows.flatMap((row, index) => {
          const side = sides.get(otherIds[index] ?? '');
          return side === undefined
            ? []
            : [
                {
                  id: row.id,
                  note: side.accessible ? row.note : null,
                  createdAt: row.createdAt.toISOString(),
                  createdByName: row.createdBy?.displayName ?? null,
                  ticket: side,
                },
              ];
        }),
        related: relatedIds.flatMap((item) => {
          const side = sides.get(item.id);
          return side === undefined ? [] : [{ ...side, relation: item.relation }];
        }),
        canManage,
        maxPerTicket: configuration.linksMaxPerTicket,
      };
    });
  }

  addLink(
    ticketId: string,
    input: { readonly ticketNumber: string; readonly note?: string },
    context: TicketMutationContext,
  ): Promise<TicketLinksResponse> {
    return executeTicketOperation(async () => {
      const configuration = await this.requireLinkManagement(context);
      const ticket = await this.loadStaffTicket(ticketId, context);
      const note = (input.note ?? '').trim();
      if (note.length > linkNoteMaxLength) {
        throw new TicketsError('INVALID_LINK_NOTE');
      }
      const number = input.ticketNumber.trim().toUpperCase();
      const target = await this.prisma.ticket.findFirst({
        where: { ticketNumber: number },
        select: { id: true },
      });
      if (target === null) {
        throw new TicketsError('LINK_TARGET_NOT_FOUND');
      }
      if (target.id === ticket.id) {
        throw new TicketsError('LINK_SELF');
      }
      // D2: the agent must see both tickets.
      let other: TicketRecord;
      try {
        other = await this.loadStaffTicket(target.id, context);
      } catch {
        throw new TicketsError('LINK_TARGET_NOT_FOUND');
      }
      if (ticket.mergedIntoTicketId !== null || other.mergedIntoTicketId !== null) {
        throw new TicketsError('LINK_MERGED');
      }
      const [ticketAId, ticketBId] = ticket.id < other.id ? [ticket.id, other.id] : [other.id, ticket.id];
      const duplicate = await this.prisma.ticketLink.findFirst({
        where: { ticketAId, ticketBId },
        select: { id: true },
      });
      if (duplicate !== null) {
        throw new TicketsError('LINK_DUPLICATE');
      }
      for (const id of [ticket.id, other.id]) {
        const count = await this.prisma.ticketLink.count({
          where: { OR: [{ ticketAId: id }, { ticketBId: id }] },
        });
        if (count >= configuration.linksMaxPerTicket) {
          throw new TicketsError('LINK_LIMIT_REACHED');
        }
      }
      const link = await this.prisma.ticketLink.create({
        data: {
          ticketAId,
          ticketBId,
          note: note.length === 0 ? null : note,
          createdByUserId: context.actorUserId,
        },
      });
      await this.recordLinkChange({
        linkId: link.id,
        action: 'add',
        ticket,
        other,
        note: link.note,
        actorUserId: context.actorUserId,
      });
      return this.listLinks(ticket.id, context);
    });
  }

  removeLink(
    ticketId: string,
    linkId: string,
    context: TicketMutationContext,
  ): Promise<TicketLinksResponse> {
    return executeTicketOperation(async () => {
      await this.requireLinkManagement(context);
      const ticket = await this.loadStaffTicket(ticketId, context);
      const link = await this.prisma.ticketLink.findFirst({
        where: { id: linkId, OR: [{ ticketAId: ticket.id }, { ticketBId: ticket.id }] },
      });
      if (link === null) {
        throw new TicketsError('LINK_NOT_FOUND');
      }
      const otherId = link.ticketAId === ticket.id ? link.ticketBId : link.ticketAId;
      const other = (await this.prisma.ticket.findUnique({ where: { id: otherId } })) as TicketRecord | null;
      await this.prisma.ticketLink.delete({ where: { id: link.id } });
      if (other !== null) {
        await this.recordLinkChange({
          linkId: link.id,
          action: 'remove',
          ticket,
          other,
          note: link.note,
          actorUserId: context.actorUserId,
        });
      }
      return this.listLinks(ticket.id, context);
    });
  }

  private async recordLinkChange(input: {
    readonly linkId: string;
    readonly action: 'add' | 'remove';
    readonly ticket: TicketRecord;
    readonly other: TicketRecord;
    readonly note: string | null;
    readonly actorUserId: string;
  }): Promise<void> {
    const snapshot = {
      ticketAId: input.ticket.id < input.other.id ? input.ticket.id : input.other.id,
      ticketBId: input.ticket.id < input.other.id ? input.other.id : input.ticket.id,
      note: input.note,
    };
    await recordCollaborationChange(this.prisma, {
      entityType: changeLogEntityTypes.ticketLink,
      entityId: input.linkId,
      action: input.action === 'add' ? changeLogActions.create : changeLogActions.delete,
      reason:
        input.action === 'add' ? ticketChangeLogReasons.linkAdd : ticketChangeLogReasons.linkRemove,
      before: input.action === 'add' ? null : snapshot,
      after: input.action === 'add' ? snapshot : null,
      actorUserId: input.actorUserId,
    });
    const action =
      input.action === 'add' ? ticketSystemEventActions.linked : ticketSystemEventActions.unlinked;
    // D5/D6: a system event on both tickets (staff-only system events reach :staff rooms).
    for (const [self, peer] of [
      [input.ticket, input.other],
      [input.other, input.ticket],
    ] as const) {
      const event = await insertSystemTicketEvent(this.prisma, {
        ticketId: self.id,
        action,
        actorUserId: input.actorUserId,
        detail: peer.ticketNumber,
      });
      await publishForTicketId(this.prisma, this.realtimeHub, self.id, [event]);
    }
  }

  private async requireLinkManagement(
    context: TicketMutationContext,
  ): Promise<AgentCollaborationConfiguration> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.linksEnabled) {
      throw new TicketsError('LINKS_DISABLED');
    }
    if (!(await this.canManageLinks(context))) {
      throw new TicketsError('FORBIDDEN');
    }
    return configuration;
  }

  private async canManageLinks(context: TicketMutationContext): Promise<boolean> {
    const authContext = await this.authorizationContextLoader.loadBySubjectId(context.actorUserId);
    if (authContext === null) {
      return false;
    }
    return (
      authContext.isSuperAdmin ||
      authContext.assignments.some((assignment) =>
        assignment.permissionKeys.includes(permissionKeys.ticketLinkManage),
      )
    );
  }

  /** D4: number always; title/status/group only when the viewer can open it (and not confidential). */
  private async describeTickets(
    ids: readonly string[],
    context: TicketMutationContext,
  ): Promise<Map<string, TicketLinkSide>> {
    const unique = [...new Set(ids)];
    const result = new Map<string, TicketLinkSide>();
    if (unique.length === 0) {
      return result;
    }
    const rows = await this.prisma.ticket.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        isConfidential: true,
        assignedUserId: true,
        assignedGroup: { select: { name: true } },
      },
    });
    const gated = await this.accessPolicies.bind(context);
    for (const row of rows) {
      let accessible = false;
      try {
        const loaded = await loadAccessibleTicket(
          this.prisma,
          this.authorizationContextLoader,
          row.id,
          gated,
        );
        accessible = loaded.access.visibility === 'staff';
      } catch {
        accessible = false;
      }
      const showDetails =
        accessible && (!row.isConfidential || row.assignedUserId === context.actorUserId);
      result.set(row.id, {
        id: accessible ? row.id : null,
        ticketNumber: row.ticketNumber,
        accessible,
        title: showDetails ? row.title : null,
        status: accessible ? row.status : null,
        groupName: showDetails ? (row.assignedGroup?.name ?? null) : null,
      });
    }
    return result;
  }

  // ---------------------------------------------------------------- shared

  private async loadStaffTicket(
    ticketId: string,
    context: TicketMutationContext,
    deniedCode: 'FORBIDDEN' | 'FOLLOW_NOT_ALLOWED' = 'FORBIDDEN',
  ): Promise<TicketRecord> {
    const { ticket, access } = await loadAccessibleTicket(
      this.prisma,
      this.authorizationContextLoader,
      ticketId,
      await this.accessPolicies.bind(context),
    );
    if (access.visibility !== 'staff') {
      throw new TicketsError(deniedCode);
    }
    return ticket;
  }

  private async confidentialConfiguration(actorUserId: string) {
    return (await this.accessPolicies.bind({ actorUserId })).confidential;
  }
}
