import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';
import type { TicketPersistedMessageSink } from '../tickets/collaboration.types';
import { insertSystemTicketEvent } from '../tickets/insert-system-ticket-event';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { publishPersistedTicketMessages } from '../tickets/publish-persisted-ticket-messages';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import type { TicketRecord } from '../tickets/tickets.types';
import { ProblemAccessService, type ProblemViewer } from './problem-access.service';
import { formatProblemNumber } from './problem-rules';
import { problemErrorCodes, problemEventActions, problemLimits, problemOpenStatuses, problemOpenTicketStatuses, ProblemError } from './problems.constants';
import { problemVisibilityWhere } from './problem-visibility';
import { problemTicketVisibility } from './problem-ticket-visibility';
import { ProblemNoticeService } from './problem-notice.service';
import { problemRecurrenceOccurrence } from './problem-notice-occurrence';

/** P5 (§11): tickets may still join a RESOLVED problem; the owner gets a recurrence signal. */
const problemLinkableStatuses: readonly string[] = [...problemOpenStatuses, 'RESOLVED'];

export { problemOpenTicketStatuses };
const readOnlyTicketStatuses = new Set(['ARCHIVED']);

export type ProblemTicketSkipReason = 'not_found' | 'merged' | 'already_linked' | 'other_problem' | 'read_only';

export type ProblemTicketLinkResult = {
  readonly linked: readonly { ticketId: string; ticketNumber: string }[];
  readonly skipped: readonly { ticketId: string; ticketNumber: string | null; reason: ProblemTicketSkipReason }[];
};

/** A staff-only system event on the ticket, published only after the commit. */
export type ProblemTicketNotice = {
  readonly ticket: TicketRecord;
  readonly messages: TicketPersistedMessageSink;
};

/** One ticket inside a link batch: linked (with its pending notice) or skipped. */
type ProblemTicketLinkItemOutcome =
  | { readonly kind: 'linked'; readonly notice: ProblemTicketNotice }
  | { readonly kind: 'skipped'; readonly reason: ProblemTicketSkipReason };

/** W7.26: the links of one batch, still unpublished (the caller commits first). */
export type ProblemTicketLinkOutcome = {
  readonly result: ProblemTicketLinkResult;
  readonly notices: readonly ProblemTicketNotice[];
};

export type TicketProblemPanel = {
  readonly enabled: boolean;
  /** Staff with `problem.read` see the panel; requesters never do (§8.3). */
  readonly visible: boolean;
  readonly canLink: boolean;
  readonly canUnlink: boolean;
  readonly problem: {
    readonly id: string;
    readonly number: string;
    readonly title: string;
    readonly status: string;
    readonly priority: string;
    readonly workaround: string | null;
    readonly workaroundAt: string | null;
    /** The viewer may open the problem record. */
    readonly canOpen: boolean;
  } | null;
};

const skipErrorCode: Record<ProblemTicketSkipReason, (typeof problemErrorCodes)[keyof typeof problemErrorCodes]> = {
  not_found: problemErrorCodes.ticketNotFound,
  merged: problemErrorCodes.validation,
  already_linked: problemErrorCodes.validation,
  other_problem: problemErrorCodes.ticketInOtherProblem,
  read_only: problemErrorCodes.validation,
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/**
 * Paket 3.3 (§8): tickets grouped under a problem. A ticket belongs to at most
 * one problem; links are internal system events on the ticket (staff only)
 * and history rows on the problem. Linking needs `problem.manage` and staff
 * access to every ticket; merged tickets are linked through their target.
 */
@Injectable()
export class ProblemTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProblemAccessService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
    /** W7.42 (BA-problems-21): the recurrence notice is an outbox intent too. */
    @Optional() private readonly notices?: ProblemNoticeService,
  ) {}

  /** Staff access to a ticket, or null (not found, requester-only, archived when writing). */
  private async staffTicket(ticketId: string, viewer: ProblemViewer, writable: boolean, prisma: PrismaService = this.prisma): Promise<TicketRecord | null> {
    try {
      const gated = await this.accessPolicies.bind({ actorUserId: viewer.userId });
      const { ticket, access } = await loadAccessibleTicket(prisma, this.authorizationContextLoader, ticketId, gated, { writable });
      return access.visibility === 'staff' ? ticket : null;
    } catch {
      return null;
    }
  }

  /** The problem must be visible to the viewer in the given permission's scope. */
  private async loadProblem(problemId: string, viewer: ProblemViewer, permission: string, prisma: PrismaService = this.prisma) {
    const scope = await this.access.require(viewer, permission);
    const readScope = permission === permissionKeys.problemRead ? scope : await this.access.require(viewer, permissionKeys.problemRead);
    const filters = [problemVisibilityWhere(scope, viewer.userId), problemVisibilityWhere(readScope, viewer.userId)].filter((filter) => filter !== null);
    const problem = await prisma.problem.findFirst({
      where: { id: problemId, AND: filters },
      select: { id: true, sequence: true, title: true, status: true },
    });
    if (problem === null) throw new ProblemError(problemErrorCodes.notFound);
    return problem;
  }

  async listForProblem(problemId: string, viewer: ProblemViewer) {
    await this.loadProblem(problemId, viewer, permissionKeys.problemRead);
    const ticketVisibility = await problemTicketVisibility(this.prisma, this.authorizationContextLoader, this.accessPolicies, viewer.userId);
    const where = { problemId, ticket: { is: ticketVisibility } } as const;
    // BA-problems-17: the window is fetched with one extra row and both numbers
    // are counted, so `total` is the real number of links the viewer may see and
    // `hasMore` is proved instead of inferred from the truncated array.
    const [links, total, open] = await Promise.all([
      this.prisma.problemTicket.findMany({
        where,
        orderBy: { linkedAt: 'desc' },
        take: problemLimits.linkedTicketListMax + 1,
        select: {
          linkedAt: true,
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              status: true,
              priority: true,
              isConfidential: true,
              createdAt: true,
              requester: { select: { id: true, displayName: true } },
              originUnit: { select: { id: true, name: true } },
              assignedUser: { select: { id: true, displayName: true } },
            },
          },
        },
      }),
      this.prisma.problemTicket.count({ where }),
      this.prisma.problemTicket.count({
        where: {
          problemId,
          ticket: { is: { AND: [ticketVisibility, { status: { in: [...problemOpenTicketStatuses] } }] } },
        },
      }),
    ]);
    return {
      total,
      open,
      hasMore: total > problemLimits.linkedTicketListMax,
      items: links.slice(0, problemLimits.linkedTicketListMax).map(({ ticket, linkedAt }) => ({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        // Confidential tickets: the title and requester stay on the ticket itself.
        title: ticket.isConfidential ? null : ticket.title,
        confidential: ticket.isConfidential,
        status: ticket.status,
        priority: ticket.priority,
        requester: ticket.isConfidential ? null : ticket.requester,
        organizationalUnit: ticket.originUnit,
        assignee: ticket.assignedUser,
        createdAt: ticket.createdAt.toISOString(),
        linkedAt: linkedAt.toISOString(),
      })),
    };
  }

  async panel(ticketId: string, viewer: ProblemViewer): Promise<TicketProblemPanel> {
    const hidden = (enabled: boolean): TicketProblemPanel => ({ enabled, visible: false, canLink: false, canUnlink: false, problem: null });
    if (!(await this.access.isEnabled())) return hidden(false);
    if (!this.access.hasPermission(viewer, permissionKeys.problemRead)) return hidden(true);
    const ticket = await this.staffTicket(ticketId, viewer, false);
    if (ticket === null) return hidden(true);
    const merged = (ticket as { mergedIntoTicketId?: string | null }).mergedIntoTicketId != null;
    const canWrite = this.access.hasPermission(viewer, permissionKeys.problemReport) && !merged && !readOnlyTicketStatuses.has(ticket.status);
    const link = await this.prisma.problemTicket.findUnique({
      where: { ticketId: ticket.id },
      select: {
        problem: { select: { id: true, sequence: true, title: true, status: true, priority: true, workaround: true, workaroundAt: true } },
      },
    });
    if (link === null) return { enabled: true, visible: true, canLink: canWrite, canUnlink: false, problem: null };
    const configuration = await this.access.configuration();
    // The card is deliberately minimal when the full problem is outside read scope.
    const problem = link.problem;
    const canOpen = await this.canOpen(problem.id, viewer);
    return {
      enabled: true,
      visible: true,
      canLink: false,
      canUnlink: canOpen && canWrite && (problemOpenStatuses as readonly string[]).includes(problem.status) && await this.canOpen(problem.id, viewer, permissionKeys.problemReport),
      problem: {
        id: problem.id,
        number: formatProblemNumber(configuration.numberPrefix, problem.sequence),
        title: problem.title,
        status: problem.status,
        priority: problem.priority,
        workaround: problem.workaround,
        workaroundAt: problem.workaroundAt?.toISOString() ?? null,
        canOpen,
      },
    };
  }

  private async canOpen(problemId: string, viewer: ProblemViewer, permission: string = permissionKeys.problemRead): Promise<boolean> {
    const scope = await this.access.scopeOf(viewer, permission);
    const visible = problemVisibilityWhere(scope, viewer.userId);
    if (visible === null) return true;
    return (await this.prisma.problem.count({ where: { id: problemId, ...visible } })) > 0;
  }

  /** W7.26: trim, dedupe and cap one link batch. */
  private normalizeTicketIds(ticketIds: readonly string[]): string[] {
    return [...new Set(ticketIds.map((id) => id.trim()).filter((id) => id.length > 0))].slice(0, problemLimits.linkBatchMax);
  }

  /**
   * Take the ticket row locks in a stable order before the "is it already
   * linked" read, so two concurrent commands (create-from-tickets vs the
   * ticket panel) cannot both pass the check and collide on the unique
   * `ticketId`. Without this the loser would abort the surrounding transaction
   * instead of reporting `other_problem`.
   */
  private async lockTickets(client: PrismaService, ticketIds: readonly string[]): Promise<void> {
    const ordered = [...new Set(ticketIds)].sort();
    if (ordered.length === 0) return;
    await client.$queryRaw`
      SELECT "id" FROM "Ticket"
      WHERE "id" = ANY(${ordered}::text[])
      ORDER BY "id"
      FOR UPDATE`;
  }

  /**
   * One ticket inside an already-open transaction: the checks, the link row,
   * the problem history row and the staff-only ticket event. Never opens a
   * transaction of its own, so the caller decides what is atomic.
   */
  private async linkTicket(
    client: PrismaService,
    problem: { readonly id: string; readonly status: string },
    ticket: TicketRecord,
    viewer: ProblemViewer,
  ): Promise<ProblemTicketLinkItemOutcome> {
    if ((ticket as { mergedIntoTicketId?: string | null }).mergedIntoTicketId != null) return { kind: 'skipped', reason: 'merged' };
    if (readOnlyTicketStatuses.has(ticket.status)) return { kind: 'skipped', reason: 'read_only' };
    const existing = await client.problemTicket.findUnique({ where: { ticketId: ticket.id }, select: { problemId: true } });
    if (existing !== null) return { kind: 'skipped', reason: existing.problemId === problem.id ? 'already_linked' : 'other_problem' };
    const messages: TicketPersistedMessageSink = [];
    await client.problemTicket.create({ data: { problemId: problem.id, ticketId: ticket.id, linkedByUserId: viewer.userId } });
    await client.problemEvent.create({
      data: {
        problemId: problem.id,
        action: problemEventActions.ticketLinked,
        actorUserId: viewer.userId,
        // P5/P6: a ticket joining a RESOLVED problem is a recurrence.
        detail: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, ...(problem.status === 'RESOLVED' ? { recurrence: true } : {}) },
      },
    });
    messages.push(
      await insertSystemTicketEvent(client, {
        ticketId: ticket.id,
        action: ticketSystemEventActions.problemLinked,
        actorUserId: viewer.userId,
      }),
    );
    return { kind: 'linked', notice: { ticket, messages } };
  }

  /** Realtime publishing stays outside the transaction (W7.26). */
  publish(notices: readonly ProblemTicketNotice[]): void {
    for (const notice of notices) publishPersistedTicketMessages(this.realtimeHub, notice.ticket, notice.messages);
  }

  /**
   * W7.26 / BA-problems-08: link a batch inside the caller's transaction.
   * Tickets that cannot be linked are reported as `skipped` and leave the rest
   * of the batch intact; the caller decides what "none of them could be
   * linked" means (creation rolls the whole command back).
   */
  async linkInTransaction(
    client: PrismaService,
    problem: { readonly id: string; readonly status: string },
    ticketIds: readonly string[],
    viewer: ProblemViewer,
  ): Promise<ProblemTicketLinkOutcome> {
    if (!problemLinkableStatuses.includes(problem.status)) throw new ProblemError(problemErrorCodes.problemNotOpen);
    const unique = this.normalizeTicketIds(ticketIds);
    if (unique.length === 0) return { result: { linked: [], skipped: [] }, notices: [] };
    await this.lockTickets(client, unique);
    const linked: { ticketId: string; ticketNumber: string }[] = [];
    const skipped: { ticketId: string; ticketNumber: string | null; reason: ProblemTicketSkipReason }[] = [];
    const notices: ProblemTicketNotice[] = [];
    for (const ticketId of unique) {
      const ticket = await this.staffTicket(ticketId, viewer, true, client);
      if (ticket === null) {
        skipped.push({ ticketId, ticketNumber: null, reason: 'not_found' });
        continue;
      }
      const outcome = await this.linkTicket(client, problem, ticket, viewer);
      if (outcome.kind === 'skipped') {
        skipped.push({ ticketId, ticketNumber: ticket.ticketNumber, reason: outcome.reason });
        continue;
      }
      notices.push(outcome.notice);
      linked.push({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber });
    }
    return { result: { linked, skipped }, notices };
  }

  /**
   * W7.26: the links a replayed create reports back (no new command ran). The
   * caller has already loaded the problem in its read scope.
   */
  async linkedTickets(problemId: string): Promise<ProblemTicketLinkResult> {
    const links = await this.prisma.problemTicket.findMany({
      where: { problemId },
      orderBy: { linkedAt: 'asc' },
      take: problemLimits.linkBatchMax,
      select: { ticketId: true, ticket: { select: { ticketNumber: true } } },
    });
    return { linked: links.map((link) => ({ ticketId: link.ticketId, ticketNumber: link.ticket.ticketNumber })), skipped: [] };
  }

  async link(
    problemId: string,
    ticketIds: readonly string[],
    viewer: ProblemViewer,
    options: { readonly singleAsError?: boolean } = {},
  ): Promise<ProblemTicketLinkResult> {
    const problem = await this.loadProblem(problemId, viewer, permissionKeys.problemReport);
    if (!problemLinkableStatuses.includes(problem.status)) throw new ProblemError(problemErrorCodes.problemNotOpen);
    const unique = this.normalizeTicketIds(ticketIds);
    if (unique.length === 0) throw new ProblemError(problemErrorCodes.validation, 'ticketIds');
    const linked: { ticketId: string; ticketNumber: string }[] = [];
    const skipped: { ticketId: string; ticketNumber: string | null; reason: ProblemTicketSkipReason }[] = [];

    for (const ticketId of unique) {
      const ticket = await this.staffTicket(ticketId, viewer, true);
      if (ticket === null) {
        skipped.push({ ticketId, ticketNumber: null, reason: 'not_found' });
        continue;
      }
      let outcome: ProblemTicketLinkItemOutcome;
      try {
        // One ticket per transaction: the rest of the batch survives a failure.
        outcome = await this.prisma.$transaction((transaction) => this.linkTicket(transaction as PrismaService, problem, ticket, viewer));
      } catch (error) {
        // A concurrent request linked the ticket first (one problem per ticket).
        if (isUniqueViolation(error)) {
          skipped.push({ ticketId, ticketNumber: ticket.ticketNumber, reason: 'other_problem' });
          continue;
        }
        throw error;
      }
      if (outcome.kind === 'skipped') {
        skipped.push({ ticketId, ticketNumber: ticket.ticketNumber, reason: outcome.reason });
        continue;
      }
      this.publish([outcome.notice]);
      linked.push({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber });
    }

    // W7.42: one intent per link command, identified by the digest of the
    // references it brought back (W7.31). A retried command finds the queued row.
    if (problem.status === 'RESOLVED' && linked.length > 0) {
      await this.notices?.enqueueAfterCommit([
        {
          kind: 'recurrence',
          problemId: problem.id,
          actorUserId: viewer.userId,
          occurrence: problemRecurrenceOccurrence(linked.map((item) => item.ticketNumber)),
        },
      ]);
    }

    // A single ticket (ticket panel) reports the reason as an error.
    if (options.singleAsError !== false && unique.length === 1 && linked.length === 0 && skipped[0] !== undefined && skipped[0].reason !== 'already_linked') {
      throw new ProblemError(skipErrorCode[skipped[0].reason], skipped[0].reason);
    }
    return { linked, skipped };
  }

  async unlink(problemId: string, ticketId: string, viewer: ProblemViewer): Promise<void> {
    const problem = await this.loadProblem(problemId, viewer, permissionKeys.problemReport);
    if (!(problemOpenStatuses as readonly string[]).includes(problem.status)) throw new ProblemError(problemErrorCodes.problemNotOpen);
    const messages: TicketPersistedMessageSink = [];
    await this.prisma.$transaction(async (transaction) => {
      // Re-read status and visibility after locking the problem, then lock the target ticket.
      await transaction.$queryRaw`SELECT "id" FROM "Problem" WHERE "id" = ${problemId} FOR UPDATE`;
      const lockedProblem = await this.loadProblem(problemId, viewer, permissionKeys.problemReport, transaction as PrismaService);
      if (!(problemOpenStatuses as readonly string[]).includes(lockedProblem.status)) throw new ProblemError(problemErrorCodes.problemNotOpen);
      await transaction.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticketId} FOR UPDATE`;
      const ticket = await this.staffTicket(ticketId, viewer, true, transaction as PrismaService);
      if (ticket === null) throw new ProblemError(problemErrorCodes.ticketNotFound);
      const link = await transaction.problemTicket.findUnique({ where: { ticketId }, select: { problemId: true } });
      if (link === null || link.problemId !== problem.id) throw new ProblemError(problemErrorCodes.ticketNotLinked);
      const removed = await transaction.problemTicket.deleteMany({ where: { problemId: problem.id, ticketId } });
      if (removed.count === 0) throw new ProblemError(problemErrorCodes.ticketNotLinked);
      await transaction.problemEvent.create({
        data: {
          problemId: problem.id,
          action: problemEventActions.ticketUnlinked,
          actorUserId: viewer.userId,
          detail: { ticketId, ticketNumber: ticket?.ticketNumber ?? null },
        },
      });
      messages.push(
        await insertSystemTicketEvent(transaction as PrismaService, {
          ticketId,
          action: ticketSystemEventActions.problemUnlinked,
          actorUserId: viewer.userId,
        }),
      );
    });
    const record = await this.staffTicket(ticketId, viewer, false);
    if (record !== null) publishPersistedTicketMessages(this.realtimeHub, record, messages);
  }
}
