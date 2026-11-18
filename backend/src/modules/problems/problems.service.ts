import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { isPathInScope, unitScopeWhere } from '../assets/asset-viewer';
import { permissionKeys } from '../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { problemTicketVisibility } from './problem-ticket-visibility';
import { assetWhereOf, problemAssetAccess } from './problem-asset-access';
import { resolveTicketPriority } from '../tickets/resolve-ticket-priority';
import { TicketPriorityMatrixConfigurationLoader } from '../tickets/priority/ticket-priority-matrix-configuration.loader';
import { ProblemAccessService, type ProblemConfiguration, type ProblemScope, type ProblemViewer } from './problem-access.service';
import {
  allowedProblemTransitions,
  assertProblemTransition,
  formatProblemNumber,
  normalizeWhys,
  parseProblemNumberSearch,
  transitionNeedsClosePermission,
  transitionTimestamps,
} from './problem-rules';
import type { CreateProblemDto, ProblemStatusDto, UpdateProblemDto } from './problems.dto';
import {
  problemErrorCodes,
  problemEventActions,
  problemFinalStatuses,
  problemLimits,
  ProblemError,
  type ProblemSeverityValue,
  type ProblemStatusValue,
} from './problems.constants';
import { problemVisibilityWhere } from './problem-visibility';
import { assertUnitFollowsGroup } from './problem-handoff-rules';
import { problemCrossDomainVisibility } from './problem-cross-domain-visibility';
import { problemClaimAuditMetadata, problemUpdateAuditMetadata } from './problem-audit';
import { problemCreatedOccurrence, problemVersionOccurrence } from './problem-notice-occurrence';
import { eligibleProblemOwnerWhere, problemOwnerEligibility } from './problem-owner-eligibility';
import { ProblemNotifier } from './problem-notifier';
import { ProblemTicketsService, type ProblemTicketLinkResult, type ProblemTicketNotice } from './problem-tickets.service';
import { computeProblemTarget, isTargetOverdue, isTargetRunning } from './problem-target';

export type ProblemListQuery = {
  readonly search?: string;
  readonly status?: readonly ProblemStatusValue[];
  readonly priority?: readonly ProblemSeverityValue[];
  /** "me" = the viewer. */
  readonly ownerUserId?: string;
  readonly groupId?: string;
  readonly organizationalUnitId?: string;
  readonly serviceId?: string;
  /** P5 (§10): only problems past their target while the cause is unknown. */
  readonly overdue?: boolean;
  /** Root-cause category; "none" = not categorised yet. */
  readonly rootCauseCategory?: string;
  readonly cursor?: string;
  readonly limit?: number;
};

const userSelect = { id: true, displayName: true, email: true } as const;

const listSelect = {
  id: true,
  sequence: true,
  title: true,
  status: true,
  priority: true,
  ownerUserId: true,
  groupId: true,
  organizationalUnitId: true,
  serviceId: true,
  rootCauseCategory: true,
  targetAt: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: userSelect },
  group: { select: { id: true, name: true } },
  organizationalUnit: { select: { id: true, name: true, ouPath: true } },
  service: { select: { id: true, name: true } },
} satisfies Prisma.ProblemSelect;

const detailSelect = {
  ...listSelect,
  description: true,
  impact: true,
  urgency: true,
  rootCause: true,
  rcaWhys: true,
  workaround: true,
  workaroundAt: true,
  resolution: true,
  knowledgeArticleId: true,
  identifiedAt: true,
  resolvedAt: true,
  closedAt: true,
  cancelledAt: true,
  cancelReason: true,
  version: true,
  createdBy: { select: userSelect },
  knowledgeArticle: { select: { id: true, title: true, status: true } },
  // W7.28: at most one transfer waits for a decision at a time.
  handoffs: {
    where: { status: 'PENDING' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: {
      id: true,
      status: true,
      reason: true,
      createdAt: true,
      requestedByUserId: true,
      toGroupId: true,
      toGroup: { select: { id: true, name: true } },
      toOrganizationalUnit: { select: { id: true, name: true, ouPath: true } },
      requestedBy: { select: userSelect },
    },
  },
} satisfies Prisma.ProblemSelect;

type ListRow = Prisma.ProblemGetPayload<{ select: typeof listSelect }>;
type DetailRow = Prisma.ProblemGetPayload<{ select: typeof detailSelect }>;

/** Fields whose old/new value goes into the history (long texts only as "changed"). */
const trackedValueFields = [
  'title',
  'impact',
  'urgency',
  'priority',
  'organizationalUnitId',
  'ownerUserId',
  'groupId',
  'serviceId',
  'rootCauseCategory',
] as const;
const trackedTextFields = ['description', 'rootCause', 'rcaWhys', 'workaround', 'resolution'] as const;

function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function optionalId(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  return value.trim();
}

/** W7.26: a lost race on a unique key (Prisma P2002). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/**
 * Paket 3.3 (§4, §5, §12, §16): problems CRUD, status lifecycle and history.
 * Reads are limited to the unit scope of `problem.read`, writes to the scope
 * of `problem.manage`; out-of-scope problems read as not found.
 */
@Injectable()
export class ProblemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProblemAccessService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    /** W7.26: creation and the first ticket links share one transaction. */
    private readonly ticketLinks: ProblemTicketsService,
    @Optional() private readonly notifier?: ProblemNotifier,
    @Optional()
    private readonly priorityMatrixLoader?: TicketPriorityMatrixConfigurationLoader,
  ) {}

  /** M7 B5: `private.ticket.priorityMatrix.enabled`, on when unavailable. */
  private async priorityMatrixEnabled(): Promise<boolean> {
    const configuration = await this.priorityMatrixLoader?.load();
    return configuration?.enabled ?? true;
  }

  private notify(label: string, operation: (notifier: ProblemNotifier) => Promise<unknown>): void {
    const notifier = this.notifier;
    if (notifier !== undefined) notifier.run(label, () => operation(notifier));
  }

  async list(viewer: ProblemViewer, query: ProblemListQuery) {
    const scope = await this.access.require(viewer, permissionKeys.problemRead);
    const configuration = await this.access.configuration();
    const limit = Math.min(Math.max(query.limit ?? problemLimits.listDefault, 1), problemLimits.listMax);
    const and: Prisma.ProblemWhereInput[] = [];
    const visible = problemVisibilityWhere(scope, viewer.userId);
    if (visible !== null) and.push(visible);
    if (query.status && query.status.length > 0) and.push({ status: { in: [...query.status] } });
    if (query.priority && query.priority.length > 0) and.push({ priority: { in: [...query.priority] } });
    if (query.ownerUserId) and.push({ ownerUserId: query.ownerUserId === 'me' ? viewer.userId : query.ownerUserId });
    if (query.groupId) and.push({ groupId: query.groupId });
    if (query.overdue) and.push({ status: { in: ['NEW', 'INVESTIGATING'] }, targetAt: { lt: new Date() } });
    if (query.rootCauseCategory) {
      and.push({ rootCauseCategory: query.rootCauseCategory === 'none' ? null : query.rootCauseCategory });
    }
    if (query.organizationalUnitId) and.push({ organizationalUnitId: query.organizationalUnitId });
    if (query.serviceId) {
      and.push({ OR: [{ serviceId: query.serviceId }, { services: { some: { serviceId: query.serviceId } } }] });
    }
    const search = query.search?.trim().slice(0, problemLimits.searchMax);
    if (search) {
      const sequence = parseProblemNumberSearch(search, configuration.numberPrefix);
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          ...(sequence === null ? [] : [{ sequence }]),
        ],
      });
    }
    const where: Prisma.ProblemWhereInput = and.length > 0 ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.problem.findMany({
        where,
        select: listSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.problem.count({ where }),
    ]);
    const page = rows.slice(0, limit);
    const counts = await this.visibleTicketCounts(page.map((row) => row.id), viewer);
    return {
      items: page.map((row) => ({ ...this.toListItem(row, configuration, counts.total.get(row.id) ?? 0), openTicketCount: counts.open.get(row.id) ?? 0 })),
      total,
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async get(viewer: ProblemViewer, id: string) {
    const scope = await this.access.require(viewer, permissionKeys.problemRead);
    const row = await this.loadInScope(id, scope, viewer);
    return this.toDetail(viewer, row, await this.access.configuration());
  }

  async events(viewer: ProblemViewer, id: string) {
    const scope = await this.access.require(viewer, permissionKeys.problemRead);
    await this.loadInScope(id, scope, viewer);
    const visibility = await problemTicketVisibility(this.prisma, this.authorizationContextLoader, this.accessPolicies, viewer.userId);
    const events: Array<{ id: string; action: string; actorUserId: string | null; detail: Prisma.JsonValue; createdAt: Date }> = [];
    const ticketActions: readonly string[] = [problemEventActions.ticketLinked, problemEventActions.ticketUnlinked];
    // BA-problems-03: asset history follows the CMDB boundary as well, so a
    // problem.read holder without `asset.read` in that asset's OU does not see
    // the tag/name through the timeline either.
    const assetActions: readonly string[] = [problemEventActions.assetLinked, problemEventActions.assetUnlinked];
    const assetAccess = await problemAssetAccess(this.prisma, viewer.userId);
    const safeActions: readonly string[] = [
      problemEventActions.created, problemEventActions.updated, problemEventActions.status, problemEventActions.owner,
      problemEventActions.knowledgeArticle,
      problemEventActions.handoffRequested, problemEventActions.handoffAccepted,
      problemEventActions.handoffRejected, problemEventActions.handoffCancelled,
      problemEventActions.serviceLinked, problemEventActions.serviceUnlinked, problemEventActions.incidentLinked, problemEventActions.incidentUnlinked,
    ];
    let cursor: string | undefined;
    // Scan in bounded pages so inaccessible events cannot occupy the visible 200-event cap.
    while (events.length < 200) {
      const batch = await this.prisma.problemEvent.findMany({
        where: { problemId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        select: { id: true, action: true, actorUserId: true, detail: true, createdAt: true },
      });
      const detailId = (detail: Prisma.JsonValue, key: string): string | null => {
        if (detail === null || Array.isArray(detail) || typeof detail !== 'object') return null;
        const value = (detail as Record<string, unknown>)[key];
        return typeof value === 'string' && value.length > 0 ? value : null;
      };
      const ids = [...new Set(batch.filter((event) => ticketActions.includes(event.action)).map((event) => detailId(event.detail, 'ticketId')).filter((value): value is string => value !== null))];
      const readable = ids.length === 0 ? [] : await this.prisma.ticket.findMany({
        where: { AND: [visibility, { id: { in: ids } }] }, select: { id: true },
      });
      const allowed = new Set(readable.map((ticket) => ticket.id));
      const assetIds = [...new Set(batch.filter((event) => assetActions.includes(event.action)).map((event) => detailId(event.detail, 'assetId')).filter((value): value is string => value !== null))];
      const readableAssets = !assetAccess.allowed || assetIds.length === 0 ? [] : await this.prisma.asset.findMany({
        where: { AND: [assetWhereOf(assetAccess), { id: { in: assetIds } }] }, select: { id: true },
      });
      const allowedAssets = new Set(readableAssets.map((asset) => asset.id));
      for (const event of batch) {
        const referencedTicket = detailId(event.detail, 'ticketId');
        const referencedAsset = detailId(event.detail, 'assetId');
        if (
          safeActions.includes(event.action) ||
          (ticketActions.includes(event.action) && referencedTicket !== null && allowed.has(referencedTicket)) ||
          (assetActions.includes(event.action) && referencedAsset !== null && allowedAssets.has(referencedAsset))
        ) events.push(event);
        if (events.length === 200) break;
      }
      if (batch.length < 200) break;
      cursor = batch[batch.length - 1]!.id;
    }
    const actorIds = [...new Set(events.map((event) => event.actorUserId).filter((value): value is string => value !== null))];
    const actors = actorIds.length === 0 ? [] : await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: userSelect });
    const byId = new Map(actors.map((actor) => [actor.id, actor]));
    return {
      items: events.map((event) => ({
        id: event.id,
        action: event.action,
        actor: event.actorUserId === null ? null : (byId.get(event.actorUserId) ?? null),
        detail: event.detail,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Explicit unit first; otherwise the viewer's home unit when it is in scope,
   * then the origin unit of the first selected ticket in scope. Agents without
   * a home unit (or scoped to another unit) can still create a problem from a
   * ticket they work on.
   */
  private async defaultUnit(viewer: ProblemViewer, scope: ProblemScope, explicit: string | null, ticketIds: readonly string[]): Promise<string> {
    if (explicit) return explicit;
    const candidates: string[] = [];
    if (viewer.homeOrganizationalUnitId) candidates.push(viewer.homeOrganizationalUnitId);
    if (ticketIds.length > 0) {
      const visibility = await problemTicketVisibility(this.prisma, this.authorizationContextLoader, this.accessPolicies, viewer.userId);
      const tickets = await this.prisma.ticket.findMany({ where: { AND: [visibility, { id: { in: [...ticketIds].slice(0, 50) } }] }, select: { id: true, originUnitId: true } });
      const byId = new Map(tickets.map((ticket) => [ticket.id, ticket.originUnitId]));
      for (const id of ticketIds) {
        const unit = byId.get(id);
        if (unit) candidates.push(unit);
      }
    }
    if (candidates.length === 0) throw new ProblemError(problemErrorCodes.validation, 'organizationalUnitId');
    const units = await this.prisma.organizationalUnit.findMany({ where: { id: { in: candidates } }, select: { id: true, ouPath: true } });
    const pathById = new Map(units.map((unit) => [unit.id, unit.ouPath]));
    for (const id of candidates) {
      const path = pathById.get(id);
      if (path !== undefined && isPathInScope(scope, path)) return id;
    }
    return candidates[0]!;
  }

  async create(viewer: ProblemViewer, input: CreateProblemDto): Promise<CreatedProblemResult> {
    const scope = await this.access.require(viewer, permissionKeys.problemReport);
    const readScope = await this.access.require(viewer, permissionKeys.problemRead);
    const clientRequestId = optionalId(input.clientRequestId) ?? null;
    const ticketIds = input.ticketIds ?? [];
    // W7.26: a retried POST (lost response, double click) replays the stored
    // problem instead of consuming another sequence number.
    const replay = await this.replayCreate(viewer, clientRequestId, ticketIds);
    if (replay !== null) return replay;
    const configuration = await this.access.configuration();
    const unitId = await this.defaultUnit(viewer, scope, optionalId(input.organizationalUnitId) ?? null, input.ticketIds ?? []);
    const unit = await this.access.requireUnitInScope(scope, unitId);
    await this.access.requireUnitInScope(readScope, unitId);
    // Decision 2026-10-01: every problem belongs to a problem group; an owner
    // is optional and only a problem manager of that group can be one.
    const groupId = optionalId(input.groupId) ?? null;
    if (groupId === null) throw new ProblemError(problemErrorCodes.validation, 'groupId');
    await this.assertProblemGroup(groupId);
    const ownerUserId = optionalId(input.ownerUserId) ?? null;
    if (ownerUserId !== null) {
      await this.access.requireGroupAuthority(viewer, permissionKeys.problemManage, groupId);
      // W7.33: the owner's manage grant must reach the problem's unit, not just any unit.
      await this.assertOwnerEligible(ownerUserId, groupId, unit.ouPath);
    }
    const serviceId = optionalId(input.serviceId) ?? null;
    await this.assertReferences({ serviceId }, viewer);
    const impact = input.impact ?? 'MEDIUM';
    const urgency = input.urgency ?? 'MEDIUM';
    const priority = await resolveTicketPriority(this.prisma, impact, urgency, {
      matrixEnabled: await this.priorityMatrixEnabled(),
    });
    const targetAt = await computeProblemTarget(this.prisma, configuration, priority, new Date());
    const title = input.title.trim();
    const description = input.description.trim();
    if (title.length < 3) throw new ProblemError(problemErrorCodes.validation, 'title');
    if (description.length === 0) throw new ProblemError(problemErrorCodes.validation, 'description');

    let outcome: CreateOutcome;
    try {
      outcome = await this.prisma.$transaction(async (transaction) => {
        const rows = await transaction.$queryRaw<{ lastNumber: number }[]>`
          INSERT INTO "ProblemSequence" ("id", "lastNumber") VALUES (1, 1)
          ON CONFLICT ("id") DO UPDATE SET "lastNumber" = "ProblemSequence"."lastNumber" + 1
          RETURNING "lastNumber"`;
        const sequence = Number(rows[0]?.lastNumber ?? 1);
        const created = await transaction.problem.create({
          data: {
            sequence,
            title,
            description,
            impact,
            urgency,
            priority,
            organizationalUnitId: unitId,
            ownerUserId,
            groupId,
            serviceId,
            targetAt,
            createdByUserId: viewer.userId,
            clientRequestId,
          },
          select: { id: true },
        });
        await transaction.problemEvent.create({
          data: {
            problemId: created.id,
            action: problemEventActions.created,
            actorUserId: viewer.userId,
            detail: { number: formatProblemNumber(configuration.numberPrefix, sequence), status: 'NEW', priority },
          },
        });
        await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
          action: auditLogActions.problemCreated,
          entityType: auditLogEntityTypes.problem,
          entityId: created.id,
          organizationalUnitId: unitId,
          metadata: { sequence, organizationalUnitId: unitId, priority } as never,
          actorUserId: viewer.userId,
        });
        // W7.26 / BA-problems-08: the first links belong to this transaction. If
        // no selected ticket can be linked the command fails as a whole, and the
        // sequence update above rolls back with it.
        const links =
          ticketIds.length === 0
            ? null
            : await this.ticketLinks.linkInTransaction(transaction as PrismaService, { id: created.id, status: 'NEW' }, ticketIds, viewer);
        if (links !== null && links.result.linked.length === 0) throw new ProblemError(problemErrorCodes.ticketsNotLinked, 'ticketIds');
        return { id: created.id, ticketLinks: links?.result ?? null, notices: links?.notices ?? [] };
      });
    } catch (error) {
      // Two concurrent creates with the same key: the loser replays the winner.
      const concurrent = isUniqueViolation(error) ? await this.replayCreate(viewer, clientRequestId, ticketIds) : null;
      if (concurrent !== null) return concurrent;
      throw error;
    }
    // Realtime ticket events and notifications stay outside the transaction.
    if (outcome.notices.length > 0) this.ticketLinks.publish(outcome.notices);
    if (ownerUserId !== null) this.notify('owner', (notifier) => notifier.ownerAssigned(outcome.id, viewer.userId, problemCreatedOccurrence));
    else this.notify('group', (notifier) => notifier.groupAssigned(outcome.id, viewer.userId, problemCreatedOccurrence));
    return { ...(await this.get(viewer, outcome.id)), ticketLinks: outcome.ticketLinks };
  }

  /** W7.26: the problem already stored for this (author, clientRequestId). */
  private async replayCreate(
    viewer: ProblemViewer,
    clientRequestId: string | null,
    ticketIds: readonly string[],
  ): Promise<CreatedProblemResult | null> {
    if (clientRequestId === null) return null;
    const existing = await this.prisma.problem.findUnique({
      where: { createdByUserId_clientRequestId: { createdByUserId: viewer.userId, clientRequestId } },
      select: { id: true },
    });
    if (existing === null) return null;
    const detail = await this.get(viewer, existing.id);
    // The links as they stand now: the replay itself skipped nothing.
    return {
      ...detail,
      ticketLinks: ticketIds.length === 0 ? null : await this.ticketLinks.linkedTickets(existing.id),
    };
  }

  /** Decision 2026-10-01: a problem manager of the problem group takes the problem over. */
  async claim(viewer: ProblemViewer, id: string) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    const current = await this.loadInScope(id, scope, viewer);
    if ((problemFinalStatuses as readonly string[]).includes(current.status)) throw new ProblemError(problemErrorCodes.finalStatus);
    await this.access.requireGroupAuthority(viewer, permissionKeys.problemManage, current.groupId);
    if (current.ownerUserId === viewer.userId) return this.get(viewer, id);
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.problem.updateMany({
        where: { id, version: current.version },
        data: { ownerUserId: viewer.userId, version: { increment: 1 } },
      });
      if (result.count === 0) throw new ProblemError(problemErrorCodes.versionConflict);
      await transaction.problemEvent.create({
        data: {
          problemId: id,
          action: problemEventActions.owner,
          actorUserId: viewer.userId,
          detail: { changes: { ownerUserId: { from: current.ownerUserId, to: viewer.userId } }, claimed: true } as never,
        },
      });
      // W7.30: taking a problem over is an ownership change, so it belongs in
      // the canonical audit log as well, not only in the problem history.
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.problemClaimed,
        entityType: auditLogEntityTypes.problem,
        entityId: id,
        organizationalUnitId: current.organizationalUnitId,
        metadata: problemClaimAuditMetadata(current.ownerUserId, viewer.userId) as never,
        actorUserId: viewer.userId,
      });
    });
    return this.get(viewer, id);
  }

  async update(viewer: ProblemViewer, id: string, input: UpdateProblemDto) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    const configuration = await this.access.configuration();
    const current = await this.loadInScope(id, scope, viewer);
    if ((problemFinalStatuses as readonly string[]).includes(current.status)) throw new ProblemError(problemErrorCodes.finalStatus);
    if (input.version !== current.version) throw new ProblemError(problemErrorCodes.versionConflict);
    await this.access.requireGroupAuthority(viewer, permissionKeys.problemManage, current.groupId);

    const data: Prisma.ProblemUncheckedUpdateManyInput = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (title.length < 3) throw new ProblemError(problemErrorCodes.validation, 'title');
      data.title = title;
    }
    if (input.description !== undefined) {
      const description = input.description.trim();
      if (description.length === 0) throw new ProblemError(problemErrorCodes.validation, 'description');
      data.description = description;
    }
    const unitId = optionalId(input.organizationalUnitId);
    if (unitId !== undefined && unitId !== null && unitId !== current.organizationalUnitId) {
      await this.access.requireUnitInScope(scope, unitId);
      await this.access.requireUnitInScope(await this.access.require(viewer, permissionKeys.problemRead), unitId);
      // W7.28: a problem lives in the unit tree of its group; leaving that tree is a handoff.
      await assertUnitFollowsGroup(this.prisma, current.groupId, unitId);
      data.organizationalUnitId = unitId;
    }
    const ownerUserId = optionalId(input.ownerUserId);
    const groupId = optionalId(input.groupId);
    const serviceId = optionalId(input.serviceId);
    if (groupId === null) throw new ProblemError(problemErrorCodes.validation, 'groupId');
    // W7.28 / BA-problems-10: the group changes only through the handoff command,
    // which checks the target group's authority and, when needed, its acceptance.
    if (groupId !== undefined && groupId !== current.groupId) {
      throw new ProblemError(problemErrorCodes.handoffRequired, 'groupId');
    }
    const targetGroupId = groupId ?? current.groupId;
    if (ownerUserId !== undefined && ownerUserId !== null && ownerUserId !== current.ownerUserId) {
      if (targetGroupId === null) throw new ProblemError(problemErrorCodes.validation, 'groupId');
      // W7.33: the grant must cover the unit the problem already lives in (a group
      // change is a handoff, which re-resolves the owner for the target unit).
      await this.assertOwnerEligible(ownerUserId, targetGroupId, current.organizationalUnit.ouPath);
    }
    await this.assertReferences(
      {
        serviceId: serviceId !== current.serviceId ? serviceId : undefined,
      },
      viewer,
    );
    if (ownerUserId !== undefined) {
      if (ownerUserId === null && current.status !== 'NEW') throw new ProblemError(problemErrorCodes.requirementMissing, 'owner');
      data.ownerUserId = ownerUserId;
    }
    if (groupId !== undefined) data.groupId = groupId;
    if (serviceId !== undefined) data.serviceId = serviceId;
    if (input.impact !== undefined || input.urgency !== undefined) {
      data.impact = input.impact ?? current.impact;
      data.urgency = input.urgency ?? current.urgency;
      data.priority = await resolveTicketPriority(this.prisma, data.impact, data.urgency, {
        matrixEnabled: await this.priorityMatrixEnabled(),
      });
    }
    // P5 (§10): a new priority moves a running target (counted from creation).
    if (data.priority !== undefined && data.priority !== current.priority && isTargetRunning(current.status)) {
      data.targetAt = await computeProblemTarget(this.prisma, configuration, data.priority as ProblemSeverityValue, current.createdAt);
      data.targetRemindersSent = [];
    }
    const category = optionalText(input.rootCauseCategory);
    if (category !== undefined) {
      if (category !== null && !configuration.rootCauseCategories.includes(category) && category !== current.rootCauseCategory) {
        throw new ProblemError(problemErrorCodes.rootCauseCategoryInvalid, category);
      }
      data.rootCauseCategory = category;
    }
    const rootCause = optionalText(input.rootCause);
    if (rootCause !== undefined) data.rootCause = rootCause;
    if (input.rcaWhys !== undefined) {
      const whys = normalizeWhys(input.rcaWhys);
      data.rcaWhys = whys === null ? (null as never) : (whys as never);
    }
    const workaround = optionalText(input.workaround);
    if (workaround !== undefined) {
      data.workaround = workaround;
      if (workaround !== current.workaround) data.workaroundAt = workaround === null ? null : new Date();
    }
    const resolution = optionalText(input.resolution);
    if (resolution !== undefined) data.resolution = resolution;

    // Requirements of the current status must stay satisfied (§5).
    const after = {
      rootCause: data.rootCause !== undefined ? (data.rootCause as string | null) : current.rootCause,
      rootCauseCategory: data.rootCauseCategory !== undefined ? (data.rootCauseCategory as string | null) : current.rootCauseCategory,
      workaround: data.workaround !== undefined ? (data.workaround as string | null) : current.workaround,
      resolution: data.resolution !== undefined ? (data.resolution as string | null) : current.resolution,
    };
    if (current.status === 'KNOWN_ERROR') {
      if (after.rootCause === null) throw new ProblemError(problemErrorCodes.requirementMissing, 'rootCause');
      if (after.rootCauseCategory === null) throw new ProblemError(problemErrorCodes.requirementMissing, 'rootCauseCategory');
    }
    if (current.status === 'KNOWN_ERROR' && configuration.requireWorkaroundForKnownError && after.workaround === null) {
      throw new ProblemError(problemErrorCodes.requirementMissing, 'workaround');
    }
    if (current.status === 'RESOLVED' && after.resolution === null) {
      throw new ProblemError(problemErrorCodes.requirementMissing, 'resolution');
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of trackedValueFields) {
      if (data[field] !== undefined && data[field] !== current[field]) changes[field] = { from: current[field], to: data[field] };
    }
    const textChanged = trackedTextFields.filter((field) => {
      if (data[field] === undefined) return false;
      return JSON.stringify(data[field] ?? null) !== JSON.stringify(current[field] ?? null);
    });
    if (Object.keys(changes).length === 0 && textChanged.length === 0) return this.get(viewer, id);

    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.problem.updateMany({
        where: { id, version: current.version },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) throw new ProblemError(problemErrorCodes.versionConflict);
      await transaction.problemEvent.create({
        data: {
          problemId: id,
          action: changes.ownerUserId && Object.keys(changes).length === 1 && textChanged.length === 0 ? problemEventActions.owner : problemEventActions.updated,
          actorUserId: viewer.userId,
          detail: { changes, textChanged } as never,
        },
      });
      // W7.30: an edit that moves the owner, the unit, the service or the
      // classification must be readable in the canonical audit log. The entry
      // names the changed fields; free text is not copied into it.
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.problemUpdated,
        entityType: auditLogEntityTypes.problem,
        entityId: id,
        organizationalUnitId: (data.organizationalUnitId as string | undefined) ?? current.organizationalUnitId,
        metadata: problemUpdateAuditMetadata(changes, textChanged) as never,
        actorUserId: viewer.userId,
      });
    });
    // W7.31: the notice belongs to the version this write produced, so a retry
    // of the same command cannot produce a second message.
    const occurrence = problemVersionOccurrence(current.version + 1);
    if (changes.ownerUserId && data.ownerUserId) this.notify('owner', (notifier) => notifier.ownerAssigned(id, viewer.userId, occurrence));
    else if (changes.groupId) this.notify('group', (notifier) => notifier.groupAssigned(id, viewer.userId, occurrence));
    return this.get(viewer, id);
  }

  async changeStatus(viewer: ProblemViewer, id: string, input: ProblemStatusDto) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    const configuration = await this.access.configuration();
    const current = await this.loadInScope(id, scope, viewer);
    if (input.version !== current.version) throw new ProblemError(problemErrorCodes.versionConflict);
    await this.access.requireGroupAuthority(viewer, permissionKeys.problemManage, current.groupId);
    const from = current.status;
    const to = input.status;
    if (transitionNeedsClosePermission(from, to) && !this.access.hasPermission(viewer, permissionKeys.problemClose)) {
      throw new ProblemError(problemErrorCodes.forbidden, 'problem.close');
    }
    assertProblemTransition(current, to, {
      reason: input.reason,
      requireWorkaroundForKnownError: configuration.requireWorkaroundForKnownError,
    });
    const reason = input.reason?.trim() || null;
    const now = new Date();
    const reopened = to === 'INVESTIGATING' && (from === 'RESOLVED' || from === 'CANCELLED');
    const action =
      to === 'CLOSED'
        ? auditLogActions.problemClosed
        : to === 'CANCELLED'
          ? auditLogActions.problemCancelled
          : to === 'INVESTIGATING' && (from === 'RESOLVED' || from === 'CANCELLED')
            ? auditLogActions.problemReopened
            : auditLogActions.problemStatusChanged;

    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.problem.updateMany({
        where: { id, version: current.version, status: from },
        data: {
          status: to,
          ...transitionTimestamps(from, to, now),
          ...(to === 'CANCELLED' ? { cancelReason: reason } : {}),
          ...(to === 'INVESTIGATING' && from === 'CANCELLED' ? { cancelReason: null } : {}),
          // P5 (§10): a reopened problem starts a new target from now.
          ...(reopened ? { targetAt: await computeProblemTarget(this.prisma, configuration, current.priority, now), targetRemindersSent: [] } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ProblemError(problemErrorCodes.versionConflict);
      await transaction.problemEvent.create({
        data: { problemId: id, action: problemEventActions.status, actorUserId: viewer.userId, detail: { from, to, reason } },
      });
      // W7.28: a closed or cancelled problem cannot change hands any more, so a
      // request that was still waiting is settled here instead of dangling.
      if ((problemFinalStatuses as readonly string[]).includes(to)) {
        const cancelled = await transaction.problemHandoff.updateMany({
          where: { problemId: id, status: 'PENDING' },
          data: {
            status: 'CANCELLED',
            decidedByUserId: viewer.userId,
            decidedAt: now,
            decisionReason: 'problem_final_status',
          },
        });
        if (cancelled.count > 0) {
          await transaction.problemEvent.create({
            data: {
              problemId: id,
              action: problemEventActions.handoffCancelled,
              actorUserId: viewer.userId,
              detail: { reason: 'problem_final_status', status: to } as never,
            },
          });
        }
      }
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action,
        entityType: auditLogEntityTypes.problem,
        entityId: id,
        organizationalUnitId: current.organizationalUnitId,
        metadata: { from, to, reason } as never,
        actorUserId: viewer.userId,
      });
    });
    return this.get(viewer, id);
  }

  /**
   * Form options (§14): units in the manage scope (read scope for readers),
   * active services, groups and the configured root-cause categories.
   */
  async options(viewer: ProblemViewer) {
    await this.access.require(viewer, permissionKeys.problemRead);
    const permission = this.access.hasPermission(viewer, permissionKeys.problemManage) ? permissionKeys.problemManage : permissionKeys.problemRead;
    const unitWhere = unitScopeWhere(await this.access.scopeOf(viewer, permission));
    const [units, services, groups, configuration] = await Promise.all([
      this.prisma.organizationalUnit.findMany({
        where: (unitWhere ?? {}) as Prisma.OrganizationalUnitWhereInput,
        select: { id: true, name: true, ouPath: true },
        orderBy: { ouPath: 'asc' },
        take: 2000,
      }),
      // W7.29 (BA-problems-11): the picker offers what the service catalog itself
      // shows this user — drafts stay admin-only, a scoped admin sees its own.
      this.prisma.service.findMany({
        where: (await this.serviceReadWhere(viewer)) as never,
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 2000,
      }),
      // Only problem groups can own a problem (decision 2026-10-01).
      this.prisma.group.findMany({ where: { isProblemGroup: true }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 2000 }),
      this.access.configuration(),
    ]);
    return {
      units: units.map((unit) => ({ id: unit.id, name: unit.name, path: unit.ouPath })),
      services,
      groups,
      rootCauseCategories: configuration.rootCauseCategories,
      homeOrganizationalUnitId: viewer.homeOrganizationalUnitId,
    };
  }

  /**
   * Owner picker: active problem managers (problem.manage through a role) who
   * are members of the given problem group (decision 2026-10-01).
   */
  async searchOwners(viewer: ProblemViewer, search: string, groupId: string | null) {
    await this.access.require(viewer, permissionKeys.problemManage);
    if (groupId === null) return { items: [] };
    const text = search.trim().slice(0, problemLimits.searchMax);
    const unitPath = await this.groupUnitPath(groupId);
    const items = await this.prisma.user.findMany({
      where: {
        // The text filter is its own `OR`, so the scope filter must stay an `AND`.
        AND: [
          this.ownerWhere(groupId, unitPath),
          ...(text.length > 0
            ? [{ OR: [{ displayName: { contains: text, mode: 'insensitive' as const } }, { email: { contains: text, mode: 'insensitive' as const } }] }]
            : []),
        ],
      },
      select: userSelect,
      orderBy: { displayName: 'asc' },
      take: 20,
    });
    return { items };
  }

  /**
   * Loads a problem in the given permission's unit scope; anything else reads as not found.
   */
  private async loadInScope(id: string, scope: ProblemScope, viewer: ProblemViewer): Promise<DetailRow> {
    const readScope = await this.access.require(viewer, permissionKeys.problemRead);
    const filters = [problemVisibilityWhere(scope, viewer.userId), problemVisibilityWhere(readScope, viewer.userId)].filter((filter) => filter !== null);
    const row = await this.prisma.problem.findFirst({
      where: { id, AND: filters },
      select: detailSelect,
    });
    if (row === null) throw new ProblemError(problemErrorCodes.notFound);
    return row;
  }

  /**
   * W7.33 (BA-problems-15): the picker asks the same question the write path
   * does — active, member of the group, and a `problem.manage` grant that covers
   * the problem group's unit.
   */
  private ownerWhere(groupId: string, unitPath: string | null): Prisma.UserWhereInput {
    return eligibleProblemOwnerWhere({ groupId, unitPath });
  }

  private async groupUnitPath(groupId: string): Promise<string | null> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { organizationalUnit: { select: { ouPath: true } } },
    });
    return group?.organizationalUnit.ouPath ?? null;
  }

  /** Exact check of the recorded owner: reason-carrying, fresh principal. */
  private async assertOwnerEligible(userId: string, groupId: string, unitPath: string | null): Promise<void> {
    const eligibility = await problemOwnerEligibility(this.prisma, { userId, groupId, unitPath });
    if (!eligibility.eligible) throw new ProblemError(problemErrorCodes.ownerNotInGroup);
  }

  private async assertProblemGroup(groupId: string): Promise<void> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId }, select: { isProblemGroup: true } });
    if (group === null) throw new ProblemError(problemErrorCodes.groupNotFound);
    if (!group.isProblemGroup) throw new ProblemError(problemErrorCodes.notProblemGroup);
  }

  /** The catalog's own read policy, as a service filter (W7.29). */
  private async serviceReadWhere(viewer: ProblemViewer): Promise<Record<string, unknown>> {
    return (await problemCrossDomainVisibility(this.authorizationContextLoader, viewer.userId)).serviceWhere;
  }

  private async assertReferences(
    input: {
      ownerUserId?: string | null;
      groupId?: string | null;
      serviceId?: string | null;
    },
    viewer: ProblemViewer,
  ): Promise<void> {
    const [owner, group, service] = await Promise.all([
      input.ownerUserId ? this.prisma.user.findUnique({ where: { id: input.ownerUserId }, select: { id: true, isActive: true } }) : null,
      input.groupId ? this.prisma.group.findUnique({ where: { id: input.groupId }, select: { id: true } }) : null,
      input.serviceId
        ? this.prisma.service.findFirst({
            where: { AND: [{ id: input.serviceId }, await this.serviceReadWhere(viewer)] },
            select: { id: true },
          })
        : null,
    ]);
    if (input.ownerUserId && (owner === null || !owner.isActive)) throw new ProblemError(problemErrorCodes.userNotFound);
    if (input.groupId && group === null) throw new ProblemError(problemErrorCodes.groupNotFound);
    if (input.serviceId && service === null) throw new ProblemError(problemErrorCodes.serviceNotFound);
  }

  /** Aggregate only tickets readable by this viewer, before counting. */
  private async visibleTicketCounts(problemIds: readonly string[], viewer: ProblemViewer) {
    if (problemIds.length === 0) return { total: new Map<string, number>(), open: new Map<string, number>() };
    const visibility = await problemTicketVisibility(this.prisma, this.authorizationContextLoader, this.accessPolicies, viewer.userId);
    const base = { problemId: { in: [...problemIds] }, ticket: { is: visibility } } satisfies Prisma.ProblemTicketWhereInput;
    const [total, open] = await Promise.all([
      this.prisma.problemTicket.groupBy({ by: ['problemId'], where: base, _count: { _all: true } }),
      this.prisma.problemTicket.groupBy({
        by: ['problemId'],
        where: { AND: [base, { ticket: { is: { status: { notIn: ['RESOLVED', 'CLOSED', 'ARCHIVED'] } } } }] },
        _count: { _all: true },
      }),
    ]);
    const asMap = (groups: typeof total) => new Map(groups.map((group) => [group.problemId, group._count._all]));
    return { total: asMap(total), open: asMap(open) };
  }

  private toListItem(row: ListRow, configuration: ProblemConfiguration, ticketCount: number) {
    return {
      id: row.id,
      number: formatProblemNumber(configuration.numberPrefix, row.sequence),
      title: row.title,
      status: row.status,
      priority: row.priority,
      rootCauseCategory: row.rootCauseCategory,
      owner: row.owner,
      group: row.group,
      organizationalUnit: row.organizationalUnit,
      service: row.service,
      ticketCount,
      targetAt: row.targetAt?.toISOString() ?? null,
      targetOverdue: isTargetOverdue(row, new Date()),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async toDetail(viewer: ProblemViewer, row: DetailRow, configuration: ProblemConfiguration) {
    const inScope = async (permission: string) =>
      this.access.hasPermission(viewer, permission) &&
      isPathInScope(await this.access.scopeOf(viewer, permission), row.organizationalUnit.ouPath);
    const manageScope = this.access.hasPermission(viewer, permissionKeys.problemManage)
      ? await this.access.scopeOf(viewer, permissionKeys.problemManage)
      : null;
    // Decision 2026-10-01: the problem group runs the problem (admins always).
    const canManage = (await inScope(permissionKeys.problemManage)) && (await this.access.hasGroupAuthority(viewer, permissionKeys.problemManage, row.groupId));
    const canClose = canManage && (await inScope(permissionKeys.problemClose));
    const canClaim = canManage && row.ownerUserId !== viewer.userId && !(problemFinalStatuses as readonly string[]).includes(row.status);
    const canLink = await inScope(permissionKeys.problemReport);
    const transitions = canManage
      ? allowedProblemTransitions(row.status).filter((to) => canClose || !transitionNeedsClosePermission(row.status, to))
      : [];
    // W7.28: the pending transfer, who may decide it, and who may call it off.
    const pending = row.handoffs[0] ?? null;
    const canDecideHandoff =
      pending !== null &&
      canManage &&
      (await this.access.hasGroupAuthority(viewer, permissionKeys.problemManage, pending.toGroupId)) &&
      manageScope !== null &&
      isPathInScope(manageScope, pending.toOrganizationalUnit.ouPath);
    const handoff =
      pending === null
        ? null
        : {
            id: pending.id,
            status: pending.status,
            reason: pending.reason,
            createdAt: pending.createdAt.toISOString(),
            requestedBy: pending.requestedBy,
            toGroup: pending.toGroup,
            toOrganizationalUnit: { id: pending.toOrganizationalUnit.id, name: pending.toOrganizationalUnit.name },
          };
    const counts = await this.visibleTicketCounts([row.id], viewer);
    // W7.33 (BA-problems-15): a recorded owner who lost the grant keeps the record
    // but the detail says so, and owner-directed notices already fall back to the
    // group managers (`ProblemNotifier`).
    const ownerEligibility =
      row.ownerUserId === null
        ? null
        : await problemOwnerEligibility(this.prisma, {
            userId: row.ownerUserId,
            groupId: row.groupId,
            unitPath: row.organizationalUnit.ouPath,
          });
    return {
      ...this.toListItem(row, configuration, counts.total.get(row.id) ?? 0),
      description: row.description,
      impact: row.impact,
      urgency: row.urgency,
      rootCause: row.rootCause,
      rcaWhys: row.rcaWhys ?? [],
      workaround: row.workaround,
      workaroundAt: row.workaroundAt?.toISOString() ?? null,
      resolution: row.resolution,
      knowledgeArticle: row.knowledgeArticle,
      identifiedAt: row.identifiedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
      createdBy: row.createdBy,
      version: row.version,
      handoff,
      ownerEligibility,
      allowedTransitions: transitions,
      permissions: {
        canManage,
        canClose,
        canClaim,
        canLink,
        canHandoff: canManage && !(problemFinalStatuses as readonly string[]).includes(row.status),
        canDecideHandoff,
        canCancelHandoff: pending !== null && (pending.requestedByUserId === viewer.userId || canManage),
      },
    };
  }
}

export type ProblemDetail = Awaited<ReturnType<ProblemsService['get']>>;

/** W7.26: the created (or replayed) problem with the links of the same command. */
export type CreatedProblemResult = ProblemDetail & {
  readonly ticketLinks: ProblemTicketLinkResult | null;
};

type CreateOutcome = {
  readonly id: string;
  readonly ticketLinks: ProblemTicketLinkResult | null;
  readonly notices: readonly ProblemTicketNotice[];
};
