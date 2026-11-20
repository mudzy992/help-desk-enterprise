import { Injectable, Optional } from '@nestjs/common';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import {
  assetLinkAccess,
  assetLinkVisible,
  assetLinkWhere,
  type AssetLinkAccess,
} from '../assets/asset-link-access';
import { isPathInScope, unitScopeWhere } from '../assets/asset-viewer';
import { permissionKeys } from '../authorization/authorization.constants';
import { problemFinalStatuses, type ProblemStatusValue } from '../problems/problems.constants';
import { formatProblemNumber, parseProblemNumberSearch } from '../problems/problem-rules';
import { problemVisibilityWhere } from '../problems/problem-visibility';
import { ChangeAccessService, type ChangeConfiguration, type ChangeScope, type ChangeViewer } from './change-access.service';
import {
  assertChangeAction,
  assertChangeWindow,
  assertReviewNotes,
  availableChangeActions,
  changeActionTimestamps,
  changeEditScope,
  computeChangeRisk,
  findFreezeOverlap,
  formatChangeNumber,
  isRequesterAction,
  parseChangeNumberSearch,
  type ChangeFacts,
} from './change-rules';
import { computeChangeQuorum } from './change-cab';
import { hasWarnings } from './change-conflicts';
import type { ChangeVoterSnapshot } from './change-voter-snapshot';
import { changeUpdateAffectsDowntime, enqueueChangeDowntimeSync } from './change-downtime-outbox';
import {
  changeOwnerEligibility,
  eligibleChangeOwnerIds,
} from './change-owner-eligibility';
import { ChangeNotifier } from './change-notifier';
import { ChangeScheduleService } from './change-schedule.service';
import {
  changeDetailLevel,
  changeVisibilityWhere,
  projectChangeEventDetail,
  type ChangeDetailLevel,
} from './change-visibility';
import { loadCabVoterIds } from './load-cab-voters';
import type { ChangeActionDto, CreateChangeDto, UpdateChangeDto } from './changes.dto';
import {
  ChangeError,
  changeErrorCodes,
  changeEventActions,
  changeFinalStatuses,
  changeLimits,
  type ChangeActionValue,
  type ChangeLevelValue,
  type ChangeRiskValue,
  type ChangeStatusValue,
  type ChangeTypeValue,
} from './changes.constants';

export type ChangeListQuery = {
  readonly search?: string;
  readonly status?: readonly ChangeStatusValue[];
  readonly type?: readonly ChangeTypeValue[];
  readonly risk?: readonly ChangeRiskValue[];
  /** "me" = the viewer. */
  readonly ownerUserId?: string;
  readonly cabGroupId?: string;
  readonly serviceId?: string;
  readonly organizationalUnitId?: string;
  /** Changes the viewer requested. */
  readonly mine?: boolean;
  /** Changes waiting for the viewer's CAB vote. */
  readonly awaitingMyVote?: boolean;
  /** Reverse links (§11): changes of a problem / touching an asset. */
  readonly problemId?: string;
  readonly assetId?: string;
  readonly cursor?: string;
  readonly limit?: number;
};

const userSelect = { id: true, displayName: true, email: true } as const;

const listSelect = {
  id: true,
  sequence: true,
  title: true,
  type: true,
  status: true,
  risk: true,
  plannedStart: true,
  plannedEnd: true,
  causesDowntime: true,
  ownerUserId: true,
  requesterUserId: true,
  cabGroupId: true,
  organizationalUnitId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: userSelect },
  requester: { select: userSelect },
  cabGroup: { select: { id: true, name: true } },
  organizationalUnit: { select: { id: true, name: true, ouPath: true } },
  services: { select: { service: { select: { id: true, name: true } } }, take: 5 },
  _count: { select: { services: true, assets: true } },
} satisfies Prisma.ChangeRequestSelect;

const detailSelect = {
  ...listSelect,
  description: true,
  reason: true,
  impact: true,
  likelihood: true,
  implementationPlan: true,
  backoutPlan: true,
  testPlan: true,
  communicationPlan: true,
  actualStart: true,
  actualEnd: true,
  outcome: true,
  reviewNotes: true,
  templateId: true,
  problemId: true,
  approvalRound: true,
  conflictsAcknowledgedAt: true,
  submittedAt: true,
  authorizedAt: true,
  closedAt: true,
  cancelledAt: true,
  cancelReason: true,
  version: true,
  template: { select: { id: true, name: true } },
  problem: { select: { id: true, sequence: true, title: true, status: true } },
  services: { select: { service: { select: { id: true, name: true } } } },
  assets: {
    select: {
      asset: {
        select: {
          id: true,
          assetTag: true,
          name: true,
          organizationalUnit: { select: { ouPath: true } },
        },
      },
    },
  },
} satisfies Prisma.ChangeRequestSelect;

type ListRow = Prisma.ChangeRequestGetPayload<{ select: typeof listSelect }>;
export type ChangeDetailRow = Prisma.ChangeRequestGetPayload<{ select: typeof detailSelect }>;

/** Fields whose old/new value goes into the history (long texts only as "changed"). */
const trackedValueFields = [
  'title',
  'type',
  'impact',
  'likelihood',
  'risk',
  'causesDowntime',
  'plannedStart',
  'plannedEnd',
  'organizationalUnitId',
  'cabGroupId',
  'ownerUserId',
  'problemId',
] as const;
const trackedTextFields = ['description', 'reason', 'implementationPlan', 'backoutPlan', 'testPlan', 'communicationPlan'] as const;
const windowFields = new Set<string>(['plannedStart', 'plannedEnd', 'ownerUserId']);

/** Change history may be read without problem.read; never expose problem identifiers through it. */
function redactProblemHistory(detail: Prisma.JsonValue): Prisma.JsonValue {
  if (detail === null || Array.isArray(detail) || typeof detail !== 'object') return detail;
  const changes = detail.changes;
  if (changes === null || Array.isArray(changes) || typeof changes !== 'object') return detail;
  const { problemId: _problemId, ...safeChanges } = changes;
  return { ...detail, changes: safeChanges };
}

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

function optionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ChangeError(changeErrorCodes.validation, 'date');
  return date;
}

function uniqueIds(values: readonly string[] | undefined): string[] | undefined {
  if (values === undefined) return undefined;
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function sameInstant(left: Date | null, right: Date | null): boolean {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function serializable(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

export function changeFactsOf(row: ChangeDetailRow): ChangeFacts {
  return {
    type: row.type,
    status: row.status,
    title: row.title,
    description: row.description,
    reason: row.reason,
    implementationPlan: row.implementationPlan,
    backoutPlan: row.backoutPlan,
    testPlan: row.testPlan,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    cabGroupId: row.cabGroupId,
    templateId: row.templateId,
    linkCount: row._count.services + row._count.assets,
  };
}

/**
 * BA-changes-02: only the linked CMDB items the viewer may read reach the
 * response shape. Rows keep the raw `organizationalUnit.ouPath` for the check;
 * the projection below never returns it.
 */
function visibleAssets(
  access: AssetLinkAccess,
  row: ChangeDetailRow,
): { id: string; assetTag: string; name: string }[] {
  return row.assets
    .map((link) => link.asset)
    .filter((asset) => assetLinkVisible(access, asset.organizationalUnit.ouPath))
    .map((asset) => ({ id: asset.id, assetTag: asset.assetTag, name: asset.name }));
}

/**
 * BA-changes-02: the list count must agree with the detail, so a scoped viewer
 * gets one grouped count instead of the stored `_count`. Returns `null` when
 * the viewer sees every unit (the stored count already matches) and an empty
 * map when nothing is visible.
 */
async function visibleAssetCounts(
  prisma: PrismaService,
  rows: readonly ListRow[],
  access: AssetLinkAccess,
): Promise<Map<string, number> | null> {
  if (access.where === null) return null;
  // Every row gets an entry: a change without a visible link must read as 0,
  // never fall back to the unscoped stored count.
  const counts = new Map<string, number>(rows.map((row) => [row.id, 0]));
  if (!access.allowed || rows.length === 0) return counts;
  const groups = await prisma.changeRequestAsset.groupBy({
    by: ['changeId'],
    where: { changeId: { in: rows.map((row) => row.id) }, asset: assetLinkWhere(access) },
    _count: { _all: true },
  });
  for (const group of groups) counts.set(group.changeId, group._count._all);
  return counts;
}

/**
 * Paket 3.4 (§4-§7, §11, §19): change CRUD, lifecycle actions and history.
 * Reads are limited to the unit scope of `change.read` (plus own and CAB
 * changes); out-of-scope changes read as not found.
 */
@Injectable()
export class ChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChangeAccessService,
    private readonly schedule: ChangeScheduleService,
    private readonly outbox: TransactionalOutboxService,
    @Optional() private readonly notifier?: ChangeNotifier,
  ) {}

  private notify(label: string, operation: (notifier: ChangeNotifier) => Promise<unknown>): void {
    const notifier = this.notifier;
    if (notifier !== undefined) notifier.run(label, () => operation(notifier));
  }

  async list(viewer: ChangeViewer, query: ChangeListQuery) {
    const scope = await this.access.require(viewer, permissionKeys.changeRead);
    const configuration = await this.access.configuration();
    const limit = Math.min(Math.max(query.limit ?? changeLimits.listDefault, 1), changeLimits.listMax);
    // BA-changes-02: linked CMDB items are behind `asset.read`; the list must
    // report the same count as the detail. Loaded on demand, once per call.
    let assetAccess: AssetLinkAccess | null = null;
    const assetsOf = async (): Promise<AssetLinkAccess> =>
      assetAccess ?? (assetAccess = await assetLinkAccess(this.prisma, viewer.userId));
    const and: Prisma.ChangeRequestWhereInput[] = [];
    const visible = changeVisibilityWhere(scope, viewer.userId);
    if (visible !== null) and.push(visible);
    if (query.status && query.status.length > 0) and.push({ status: { in: [...query.status] } });
    if (query.type && query.type.length > 0) and.push({ type: { in: [...query.type] } });
    if (query.risk && query.risk.length > 0) and.push({ risk: { in: [...query.risk] } });
    if (query.ownerUserId) and.push({ ownerUserId: query.ownerUserId === 'me' ? viewer.userId : query.ownerUserId });
    if (query.cabGroupId) and.push({ cabGroupId: query.cabGroupId });
    if (query.organizationalUnitId) and.push({ organizationalUnitId: query.organizationalUnitId });
    if (query.serviceId) and.push({ services: { some: { serviceId: query.serviceId } } });
    if (query.mine) and.push({ requesterUserId: viewer.userId });
    if (query.problemId) {
      if (!(await this.canReadProblem(viewer, query.problemId))) return { items: [], total: 0, nextCursor: null };
      and.push({ problemId: query.problemId });
    }
    if (query.assetId) {
      // A foreign asset id must not become an existence oracle: it filters
      // within the assets the viewer can read, whenever that is a real subset.
      const access = await assetsOf();
      and.push({ assets: { some: { assetId: query.assetId, asset: assetLinkWhere(access) } } });
    }
    if (query.awaitingMyVote) {
      and.push({
        status: 'AUTHORIZATION',
        cabGroup: { members: { some: { userId: viewer.userId } } },
        NOT: { requesterUserId: viewer.userId },
      });
    }
    const search = query.search?.trim().slice(0, changeLimits.searchMax);
    if (search) {
      const sequence = parseChangeNumberSearch(search, configuration.numberPrefix);
      and.push({
        OR: [{ title: { contains: search, mode: 'insensitive' } }, ...(sequence === null ? [] : [{ sequence }])],
      });
    }
    const where: Prisma.ChangeRequestWhereInput = and.length > 0 ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.changeRequest.findMany({
        where,
        select: listSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.changeRequest.count({ where }),
    ]);
    const page = rows.slice(0, limit);
    const assetCounts = page.length === 0 ? null : await visibleAssetCounts(this.prisma, page, await assetsOf());
    // awaitingMyVote: drop changes the viewer already voted on in the current round.
    const voted = query.awaitingMyVote ? await this.votedChangeIds(viewer.userId, page) : new Set<string>();
    return {
      items: page
        .filter((row) => !voted.has(row.id))
        .map((row) => this.toListItem(row, configuration, assetCounts?.get(row.id))),
      total,
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  private async votedChangeIds(userId: string, rows: readonly ListRow[]): Promise<Set<string>> {
    if (rows.length === 0) return new Set();
    const votes = await this.prisma.changeApproval.findMany({
      where: { approverUserId: userId, changeId: { in: rows.map((row) => row.id) } },
      select: { changeId: true, round: true, change: { select: { approvalRound: true } } },
    });
    return new Set(votes.filter((vote) => vote.round === vote.change.approvalRound).map((vote) => vote.changeId));
  }

  async get(viewer: ChangeViewer, id: string) {
    const scope = await this.access.require(viewer, permissionKeys.changeRead);
    const row = await this.loadInScope(id, scope, viewer);
    // W7.65: the visibility exception decides *that* the row is readable; this
    // decides how much of it the role actually needs.
    const level = await this.detailLevelFor(viewer, row, scope);
    return this.toDetail(viewer, row, await this.access.configuration(), level);
  }

  async events(viewer: ChangeViewer, id: string) {
    const scope = await this.access.require(viewer, permissionKeys.changeRead);
    const row = await this.loadInScope(id, scope, viewer);
    const level = await this.detailLevelFor(viewer, row, scope);
    const events = await this.prisma.changeEvent.findMany({
      where: { changeId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: { id: true, action: true, actorUserId: true, detail: true, createdAt: true },
    });
    const actorIds = [...new Set(events.map((event) => event.actorUserId).filter((value): value is string => value !== null))];
    const actors = actorIds.length === 0 ? [] : await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: userSelect });
    const byId = new Map(actors.map((actor) => [actor.id, actor]));
    return {
      items: events.map((event) => ({
        id: event.id,
        action: event.action,
        actor: event.actorUserId === null ? null : (byId.get(event.actorUserId) ?? null),
        // W7.65: field-level diffs, vote comments and voter snapshots stay with
        // the readers who are inside the change's scope.
        detail: redactProblemHistory(projectChangeEventDetail(event.detail, level)),
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async create(viewer: ChangeViewer, input: CreateChangeDto) {
    const scope = await this.access.require(viewer, permissionKeys.changeRequest);
    const configuration = await this.access.configuration();
    const unitId = optionalId(input.organizationalUnitId) ?? viewer.homeOrganizationalUnitId;
    if (!unitId) throw new ChangeError(changeErrorCodes.validation, 'organizationalUnitId');
    await this.access.requireUnitInScope(scope, unitId);
    const isManager = this.access.hasPermission(viewer, permissionKeys.changeManage);

    const title = input.title.trim();
    if (title.length < changeLimits.titleMin) throw new ChangeError(changeErrorCodes.validation, 'title');
    let description = input.description?.trim() ?? '';
    const reason = input.reason?.trim() ?? '';
    let impact: ChangeLevelValue = input.impact ?? 'MEDIUM';
    let likelihood: ChangeLevelValue = input.likelihood ?? 'MEDIUM';
    let implementationPlan = optionalText(input.implementationPlan) ?? null;
    let backoutPlan = optionalText(input.backoutPlan) ?? null;
    let testPlan = optionalText(input.testPlan) ?? null;
    let causesDowntime = input.causesDowntime ?? false;
    let serviceIds = uniqueIds(input.serviceIds) ?? [];
    let templateId: string | null = null;

    if (input.type === 'STANDARD') {
      // §13: a standard change is always created from an active template.
      templateId = optionalId(input.templateId) ?? null;
      if (templateId === null) throw new ChangeError(changeErrorCodes.requirementMissing, 'templateId');
      const template = await this.prisma.changeTemplate.findUnique({
        where: { id: templateId },
        select: {
          isActive: true,
          description: true,
          implementationPlan: true,
          backoutPlan: true,
          testPlan: true,
          impact: true,
          likelihood: true,
          causesDowntime: true,
          services: { select: { serviceId: true } },
        },
      });
      if (template === null) throw new ChangeError(changeErrorCodes.templateNotFound);
      if (!template.isActive) throw new ChangeError(changeErrorCodes.templateInactive);
      const templateRisk = computeChangeRisk(template.impact, template.likelihood);
      if (templateRisk === 'HIGH' || templateRisk === 'CRITICAL') throw new ChangeError(changeErrorCodes.templateRisk);
      impact = template.impact;
      likelihood = template.likelihood;
      implementationPlan = template.implementationPlan;
      backoutPlan = template.backoutPlan;
      testPlan = template.testPlan;
      causesDowntime = input.causesDowntime ?? template.causesDowntime;
      if (description.length === 0) description = template.description;
      serviceIds = [...new Set([...template.services.map((service) => service.serviceId), ...serviceIds])];
    }
    if (description.length === 0) throw new ChangeError(changeErrorCodes.validation, 'description');
    const plannedStart = optionalDate(input.plannedStart) ?? null;
    const plannedEnd = optionalDate(input.plannedEnd) ?? null;
    if (plannedStart !== null && plannedEnd !== null) assertChangeWindow(plannedStart, plannedEnd);

    const assetIds = uniqueIds(input.assetIds) ?? [];
    const problemId = optionalId(input.problemId) ?? null;
    const ownerUserId = optionalId(input.ownerUserId) ?? null;
    if (ownerUserId !== null && !isManager) throw new ChangeError(changeErrorCodes.forbidden, 'owner');
    let cabGroupId = optionalId(input.cabGroupId) ?? null;
    if (input.type !== 'STANDARD') cabGroupId ??= await this.defaultCabGroupId();
    else cabGroupId = null;
    await this.assertReferences(viewer, {
      serviceIds,
      assetIds,
      problemId,
      ownerUserId,
      cabGroupId,
      organizationalUnitId: unitId,
    });
    const risk = computeChangeRisk(impact, likelihood);

    const id = await this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<{ lastNumber: number }[]>`
        INSERT INTO "ChangeSequence" ("id", "lastNumber") VALUES (1, 1)
        ON CONFLICT ("id") DO UPDATE SET "lastNumber" = "ChangeSequence"."lastNumber" + 1
        RETURNING "lastNumber"`;
      const sequence = Number(rows[0]?.lastNumber ?? 1);
      const created = await transaction.changeRequest.create({
        data: {
          sequence,
          title,
          description,
          reason,
          type: input.type,
          impact,
          likelihood,
          risk,
          implementationPlan,
          backoutPlan,
          testPlan,
          communicationPlan: optionalText(input.communicationPlan) ?? null,
          causesDowntime,
          plannedStart,
          plannedEnd,
          organizationalUnitId: unitId,
          cabGroupId,
          ownerUserId,
          requesterUserId: viewer.userId,
          templateId,
          problemId,
          services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
          assets: { create: assetIds.map((assetId) => ({ assetId })) },
        },
        select: { id: true },
      });
      await transaction.changeEvent.create({
        data: {
          changeId: created.id,
          action: changeEventActions.created,
          actorUserId: viewer.userId,
          detail: { number: formatChangeNumber(configuration.numberPrefix, sequence), type: input.type, risk, templateId },
        },
      });
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.changeCreated,
        entityType: auditLogEntityTypes.change,
        entityId: created.id,
        metadata: { sequence, type: input.type, risk, organizationalUnitId: unitId } as never,
        actorUserId: viewer.userId,
        organizationalUnitId: unitId,
      });
      return created.id;
    });
    return this.get(viewer, id);
  }

  /** A change manager takes the change over as its owner. */
  async claim(viewer: ChangeViewer, id: string) {
    const scope = await this.access.require(viewer, permissionKeys.changeManage);
    const current = await this.loadInScope(id, scope, viewer);
    if (changeFinalStatuses.includes(current.status)) throw new ChangeError(changeErrorCodes.finalStatus);
    if (current.ownerUserId === viewer.userId) return this.get(viewer, id);
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.changeRequest.updateMany({
        where: { id, version: current.version },
        data: { ownerUserId: viewer.userId, version: { increment: 1 } },
      });
      if (result.count === 0) throw new ChangeError(changeErrorCodes.versionConflict);
      await transaction.changeEvent.create({
        data: {
          changeId: id,
          action: changeEventActions.owner,
          actorUserId: viewer.userId,
          detail: { changes: { ownerUserId: { from: current.ownerUserId, to: viewer.userId } }, claimed: true } as never,
        },
      });
    });
    return this.get(viewer, id);
  }

  async update(viewer: ChangeViewer, id: string, input: UpdateChangeDto) {
    const scope = await this.access.require(viewer, permissionKeys.changeRead);
    const configuration = await this.access.configuration();
    const current = await this.loadInScope(id, scope, viewer);
    if (changeFinalStatuses.includes(current.status)) throw new ChangeError(changeErrorCodes.finalStatus);
    if (input.version !== current.version) throw new ChangeError(changeErrorCodes.versionConflict);
    const editScope = await this.editScopeFor(viewer, current);
    if (editScope === 'none') throw new ChangeError(current.status === 'AUTHORIZATION' ? changeErrorCodes.locked : changeErrorCodes.forbidden);
    const isManager = await this.canManage(viewer, current);

    const data: Prisma.ChangeRequestUncheckedUpdateManyInput = {};
    const requested = new Set(Object.keys(input).filter((key) => key !== 'version' && (input as unknown as Record<string, unknown>)[key] !== undefined));
    if (editScope === 'window') {
      const outside = [...requested].filter((key) => !windowFields.has(key));
      if (outside.length > 0) throw new ChangeError(changeErrorCodes.locked, outside[0]);
    }
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (title.length < changeLimits.titleMin) throw new ChangeError(changeErrorCodes.validation, 'title');
      data.title = title;
    }
    if (input.description !== undefined) {
      const description = input.description.trim();
      if (description.length === 0) throw new ChangeError(changeErrorCodes.validation, 'description');
      data.description = description;
    }
    if (input.reason !== undefined) data.reason = input.reason.trim();
    if (input.type !== undefined && input.type !== current.type) {
      // Standard changes come from a template; the type moves only between normal and emergency, in DRAFT.
      if (current.status !== 'DRAFT' || input.type === 'STANDARD' || current.type === 'STANDARD') {
        throw new ChangeError(changeErrorCodes.locked, 'type');
      }
      data.type = input.type;
    }
    const templateLocked = current.type === 'STANDARD';
    const lockedByTemplate = (field: 'impact' | 'likelihood' | 'implementationPlan' | 'backoutPlan', value: unknown) => {
      if (templateLocked && value !== undefined && value !== current[field]) throw new ChangeError(changeErrorCodes.locked, 'template');
    };
    lockedByTemplate('impact', input.impact);
    lockedByTemplate('likelihood', input.likelihood);
    lockedByTemplate('implementationPlan', optionalText(input.implementationPlan));
    lockedByTemplate('backoutPlan', optionalText(input.backoutPlan));
    if (input.impact !== undefined || input.likelihood !== undefined) {
      data.impact = input.impact ?? current.impact;
      data.likelihood = input.likelihood ?? current.likelihood;
      data.risk = computeChangeRisk(data.impact as ChangeLevelValue, data.likelihood as ChangeLevelValue);
    }
    for (const field of ['implementationPlan', 'backoutPlan', 'testPlan', 'communicationPlan'] as const) {
      const value = optionalText(input[field]);
      if (value !== undefined) data[field] = value;
    }
    if (input.causesDowntime !== undefined) data.causesDowntime = input.causesDowntime;
    const plannedStart = optionalDate(input.plannedStart);
    const plannedEnd = optionalDate(input.plannedEnd);
    if (plannedStart !== undefined) data.plannedStart = plannedStart;
    if (plannedEnd !== undefined) data.plannedEnd = plannedEnd;
    const nextStart = plannedStart !== undefined ? plannedStart : current.plannedStart;
    const nextEnd = plannedEnd !== undefined ? plannedEnd : current.plannedEnd;
    if (nextStart !== null && nextEnd !== null) assertChangeWindow(nextStart, nextEnd);
    if (current.status === 'SCHEDULED' && (plannedStart !== undefined || plannedEnd !== undefined)) {
      // §6: a scheduled change keeps a complete window outside any freeze (emergency excepted).
      assertChangeWindow(nextStart, nextEnd);
      if (current.type !== 'EMERGENCY') {
        const freeze = findFreezeOverlap(nextStart as Date, nextEnd as Date, configuration.freezePeriods, configuration.timeZone);
        if (freeze !== null) throw new ChangeError(changeErrorCodes.freeze, freeze.label || `${freeze.from}..${freeze.to}`);
      }
    }

    const unitId = optionalId(input.organizationalUnitId);
    if (unitId !== undefined && unitId !== null && unitId !== current.organizationalUnitId) {
      await this.access.requireUnitInScope(scope, unitId);
      data.organizationalUnitId = unitId;
    }
    const ownerUserId = optionalId(input.ownerUserId);
    if (ownerUserId !== undefined && ownerUserId !== current.ownerUserId) {
      if (!isManager) throw new ChangeError(changeErrorCodes.forbidden, 'owner');
      data.ownerUserId = ownerUserId;
    }
    const cabGroupId = optionalId(input.cabGroupId);
    if (cabGroupId !== undefined && cabGroupId !== current.cabGroupId) {
      if (current.type === 'STANDARD' && cabGroupId !== null) throw new ChangeError(changeErrorCodes.locked, 'cabGroupId');
      data.cabGroupId = cabGroupId;
    }
    const problemId = optionalId(input.problemId);
    if (problemId !== undefined && problemId !== current.problemId) data.problemId = problemId;
    const serviceIds = uniqueIds(input.serviceIds);
    const assetIds = uniqueIds(input.assetIds);
    // BA-changes-02: an editor without `asset.read` in a linked asset's unit
    // never sees that link, so a save must not silently delete it. The update
    // replaces only the links the viewer can actually read.
    const visibleCurrentAssetIds = assetIds === undefined
      ? new Set<string>()
      : new Set(visibleAssets(await assetLinkAccess(this.prisma, viewer.userId), current).map((asset) => asset.id));
    // W7.66: the owner has to be a manager of the unit the change ends up in.
    // The pair is validated only when one of them actually moves, so a change
    // whose owner lost the assignment later can still be edited.
    const ownerMoved = ownerUserId !== undefined && ownerUserId !== current.ownerUserId;
    const unitMoved = unitId !== undefined && unitId !== null && unitId !== current.organizationalUnitId;
    const effectiveUnitId = unitId ?? current.organizationalUnitId;
    await this.assertReferences(viewer, {
      serviceIds: serviceIds?.filter((serviceId) => !current.services.some((link) => link.service.id === serviceId)),
      assetIds: assetIds?.filter((assetId) => !current.assets.some((link) => link.asset.id === assetId)),
      problemId: data.problemId as string | null | undefined,
      ownerUserId: ownerMoved || unitMoved ? ownerUserId : undefined,
      cabGroupId: data.cabGroupId as string | null | undefined,
      organizationalUnitId: ownerMoved || unitMoved ? effectiveUnitId : undefined,
    });

    // §6: a scheduled change moved outside its approved window goes back to the CAB.
    const windowMoved = current.status === 'SCHEDULED' && (plannedStart !== undefined || plannedEnd !== undefined);
    const reauthorize =
      windowMoved &&
      current.type !== 'STANDARD' &&
      current.plannedStart !== null &&
      current.plannedEnd !== null &&
      ((nextStart as Date).getTime() < current.plannedStart.getTime() || (nextEnd as Date).getTime() > current.plannedEnd.getTime());

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of trackedValueFields) {
      const next = data[field];
      if (next === undefined) continue;
      const previous = current[field];
      const equal = next instanceof Date || previous instanceof Date ? sameInstant(next as Date | null, previous as Date | null) : next === previous;
      if (!equal) changes[field] = { from: serializable(previous), to: serializable(next) };
    }
    const textChanged = trackedTextFields.filter((field) => data[field] !== undefined && (data[field] ?? null) !== (current[field] ?? null));
    const currentServiceIds = current.services.map((link) => link.service.id);
    const currentAssetIds = current.assets.map((link) => link.asset.id);
    const addedServices = serviceIds?.filter((value) => !currentServiceIds.includes(value)) ?? [];
    const removedServices = serviceIds === undefined ? [] : currentServiceIds.filter((value) => !serviceIds.includes(value));
    const addedAssets = assetIds?.filter((value) => !currentAssetIds.includes(value)) ?? [];
    const removedAssets = assetIds === undefined
      ? []
      : currentAssetIds.filter((value) => visibleCurrentAssetIds.has(value) && !assetIds.includes(value));
    const linksChanged = addedServices.length + removedServices.length + addedAssets.length + removedAssets.length > 0;
    // W7.64: the window message is derived from the title, so a rename is drift.
    const downtimeMayHaveChanged = changeUpdateAffectsDowntime({
      changedFields: Object.keys(changes),
      addedServices: addedServices.length,
      removedServices: removedServices.length,
    });
    if (Object.keys(changes).length === 0 && textChanged.length === 0 && !linksChanged) {
      return this.toDetail(viewer, current, configuration, await this.detailLevelFor(viewer, current, scope));
    }

    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.changeRequest.updateMany({
        where: { id, version: current.version, status: current.status },
        data: {
          ...data,
          // A moved window must be acknowledged again (§9).
          ...(changes.plannedStart || changes.plannedEnd ? { conflictsAcknowledgedAt: null, reminderSentAt: null, overdueNotifiedAt: null } : {}),
          ...(reauthorize ? { status: 'AUTHORIZATION' as const, approvalRound: { increment: 1 }, authorizedAt: null } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ChangeError(changeErrorCodes.versionConflict);
      if (removedServices.length > 0) await transaction.changeRequestService.deleteMany({ where: { changeId: id, serviceId: { in: removedServices } } });
      if (addedServices.length > 0) await transaction.changeRequestService.createMany({ data: addedServices.map((serviceId) => ({ changeId: id, serviceId })), skipDuplicates: true });
      if (removedAssets.length > 0) await transaction.changeRequestAsset.deleteMany({ where: { changeId: id, assetId: { in: removedAssets } } });
      if (addedAssets.length > 0) await transaction.changeRequestAsset.createMany({ data: addedAssets.map((assetId) => ({ changeId: id, assetId })), skipDuplicates: true });
      const onlyOwner = Object.keys(changes).length === 1 && changes.ownerUserId !== undefined && textChanged.length === 0 && !linksChanged;
      await transaction.changeEvent.create({
        data: {
          changeId: id,
          action: onlyOwner ? changeEventActions.owner : changeEventActions.updated,
          actorUserId: viewer.userId,
          detail: { changes, textChanged, addedServices, removedServices, addedAssets, removedAssets } as never,
        },
      });
      if (reauthorize) {
        await transaction.changeEvent.create({
          data: {
            changeId: id,
            action: changeEventActions.status,
            actorUserId: viewer.userId,
            detail: { from: 'SCHEDULED', to: 'AUTHORIZATION', action: 'reschedule' } as never,
          },
        });
      }
      if (downtimeMayHaveChanged && (current.status === 'SCHEDULED' || current.status === 'IMPLEMENTING')) {
        await enqueueChangeDowntimeSync(this.outbox, transaction, { changeId: id, version: current.version + 1, actorUserId: viewer.userId });
      }
    });
    if (reauthorize) this.notify('approval', (notifier) => notifier.approvalRequested(id, current.approvalRound + 1, viewer.userId));
    return this.get(viewer, id);
  }

  /** §6: lifecycle actions (submit, return, authorize, withdraw, schedule, start, finish, close, cancel). */
  async act(viewer: ChangeViewer, id: string, input: ChangeActionDto) {
    const scope = await this.access.require(viewer, permissionKeys.changeRead);
    const configuration = await this.access.configuration();
    const current = await this.loadInScope(id, scope, viewer);
    if (input.version !== current.version) throw new ChangeError(changeErrorCodes.versionConflict);
    await this.assertActionAllowed(viewer, current, input.action);
    const now = new Date();
    const target = assertChangeAction(changeFactsOf(current), input.action, input, configuration, now);
    // BA-changes-06: the round opens with one provable voter set and quorum.
    let voterSnapshot: ChangeVoterSnapshot | null = null;
    if (target === 'AUTHORIZATION') {
      // §8: someone other than the requester must be able to vote.
      const voters = current.cabGroupId === null
        ? []
        : (await loadCabVoterIds(this.prisma, current.cabGroupId)).filter((voterId) => voterId !== current.requesterUserId);
      if (voters.length === 0) throw new ChangeError(changeErrorCodes.noApprovers);
      voterSnapshot = {
        round: current.approvalRound,
        voters,
        quorum: computeChangeQuorum(current.type, configuration, voters.length),
      };
    }
    let acknowledge = false;
    if (target === 'AUTHORIZATION' || input.action === 'schedule') {
      // §9: conflicts are warnings that must be acknowledged once per window.
      const conflicts = await this.schedule.conflictsFor(
        {
          changeId: current.id,
          type: current.type,
          window: { start: current.plannedStart as Date, end: current.plannedEnd as Date },
          serviceIds: current.services.map((link) => link.service.id),
          assetIds: current.assets.map((link) => link.asset.id),
        },
        configuration,
      );
      if (hasWarnings(conflicts) && current.conflictsAcknowledgedAt === null) {
        if (input.acknowledgeConflicts !== true) throw new ChangeError(changeErrorCodes.conflictsNotAcknowledged);
        acknowledge = true;
      }
    }
    const reason = input.reason?.trim() || null;
    const reviewNotes = input.action === 'close' ? assertReviewNotes(current.outcome, input.reviewNotes ?? current.reviewNotes) : undefined;
    const from = current.status;

    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.changeRequest.updateMany({
        where: { id, version: current.version, status: from },
        data: {
          status: target,
          ...changeActionTimestamps(input.action, target, now),
          ...(input.action === 'cancel' ? { cancelReason: reason } : {}),
          ...(input.action === 'finish' ? { outcome: input.outcome ?? null, ...(input.reviewNotes ? { reviewNotes: input.reviewNotes.trim() } : {}) } : {}),
          ...(reviewNotes !== undefined ? { reviewNotes } : {}),
          // §4: a withdrawal opens a new voting round; earlier votes stay in the history.
          ...(input.action === 'withdraw' ? { approvalRound: { increment: 1 }, authorizedAt: null } : {}),
          ...(acknowledge ? { conflictsAcknowledgedAt: now } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ChangeError(changeErrorCodes.versionConflict);
      if (acknowledge) {
        await transaction.changeEvent.create({
          data: { changeId: id, action: changeEventActions.conflictsAcknowledged, actorUserId: viewer.userId, detail: { action: input.action } },
        });
      }
      const failed = input.action === 'finish' && (input.outcome === 'FAILED' || input.outcome === 'ROLLED_BACK');
      if (failed && current.problemId !== null) {
        // §12: the problem keeps a trace so it is not closed on a failed fix.
        await transaction.problemEvent.create({
          data: {
            problemId: current.problemId,
            action: 'change_failed',
            actorUserId: viewer.userId,
            detail: { changeId: id, number: formatChangeNumber(configuration.numberPrefix, current.sequence), outcome: input.outcome } as never,
          },
        });
      }
      await transaction.changeEvent.create({
        data: {
          changeId: id,
          action: changeEventActions.status,
          actorUserId: viewer.userId,
          detail: {
            from,
            to: target,
            action: input.action,
            reason,
            outcome: input.outcome ?? null,
            ...(voterSnapshot === null ? {} : { round: voterSnapshot.round, voterSnapshot }),
          } as never,
        },
      });
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.changeStatusChanged,
        entityType: auditLogEntityTypes.change,
        entityId: id,
        metadata: { from, to: target, action: input.action, reason } as never,
        actorUserId: viewer.userId,
        organizationalUnitId: current.organizationalUnitId,
      });
      const affectsDowntime =
        from === 'SCHEDULED' ||
        from === 'IMPLEMENTING' ||
        target === 'SCHEDULED' ||
        target === 'IMPLEMENTING';
      if (affectsDowntime) {
        await enqueueChangeDowntimeSync(this.outbox, transaction, { changeId: id, version: current.version + 1, actorUserId: viewer.userId });
      }
    });
    await this.afterAction(viewer, current, input, target);
    return this.get(viewer, id);
  }

  /** Notifications and other non-durable notices after the lifecycle transaction commits. */
  private async afterAction(viewer: ChangeViewer, current: ChangeDetailRow, input: ChangeActionDto, target: ChangeStatusValue): Promise<void> {
    if (target === 'AUTHORIZATION') {
      this.notify('approval', (notifier) => notifier.approvalRequested(current.id, current.approvalRound, viewer.userId));
    }
    const failed = input.action === 'finish' && (input.outcome === 'FAILED' || input.outcome === 'ROLLED_BACK');
    if (failed && current.problemId !== null) {
      const problem = await this.prisma.problem.findUnique({ where: { id: current.problemId }, select: { ownerUserId: true } });
      const ownerId = problem?.ownerUserId ?? null;
      if (ownerId !== null) this.notify('failed', (notifier) => notifier.failedOnProblem(current.id, ownerId, viewer.userId));
    }
  }

  /** §9: conflicts of the change's current window (empty without a window). */
  async conflicts(viewer: ChangeViewer, id: string) {
    const scope = await this.access.require(viewer, permissionKeys.changeRead);
    const current = await this.loadInScope(id, scope, viewer);
    const configuration = await this.access.configuration();
    if (current.plannedStart === null || current.plannedEnd === null || current.plannedStart >= current.plannedEnd) {
      return {
        changes: [],
        downtime: [],
        restricted: { changes: 0, downtime: 0 },
        freeze: null,
        freezeBlocks: false,
        hasWarnings: false,
        acknowledgedAt: null,
      };
    }
    const conflicts = await this.schedule.conflictsFor(
      {
        changeId: current.id,
        type: current.type,
        window: { start: current.plannedStart, end: current.plannedEnd },
        serviceIds: current.services.map((link) => link.service.id),
        assetIds: current.assets.map((link) => link.asset.id),
      },
      configuration,
    );
    return {
      ...(await this.schedule.describe(conflicts, configuration, { scope, userId: viewer.userId })),
      acknowledgedAt: current.conflictsAcknowledgedAt?.toISOString() ?? null,
    };
  }

  /**
   * Form options (§17): units in scope, active services, CAB groups, active
   * standard templates and the configuration the form needs.
   */
  async options(viewer: ChangeViewer) {
    await this.access.require(viewer, permissionKeys.changeRead);
    const permission = this.access.hasPermission(viewer, permissionKeys.changeRequest) ? permissionKeys.changeRequest : permissionKeys.changeRead;
    const unitWhere = unitScopeWhere(await this.access.scopeOf(viewer, permission));
    const [units, services, cabGroups, templates, configuration] = await Promise.all([
      this.prisma.organizationalUnit.findMany({
        where: (unitWhere ?? {}) as Prisma.OrganizationalUnitWhereInput,
        select: { id: true, name: true, ouPath: true },
        orderBy: { ouPath: 'asc' },
        take: 2000,
      }),
      this.prisma.service.findMany({
        where: { lifecycle: { not: 'DEPRECATED' } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 2000,
      }),
      this.prisma.group.findMany({ where: { isCabGroup: true }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 }),
      this.prisma.changeTemplate.findMany({
        where: { isActive: true },
        select: { id: true, name: true, impact: true, likelihood: true, causesDowntime: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      this.access.configuration(),
    ]);
    return {
      units: units.map((unit) => ({ id: unit.id, name: unit.name, path: unit.ouPath })),
      services,
      cabGroups,
      templates: templates.map((template) => ({ ...template, risk: computeChangeRisk(template.impact, template.likelihood) })),
      homeOrganizationalUnitId: viewer.homeOrganizationalUnitId,
      freezePeriods: configuration.freezePeriods,
      requireTestPlan: configuration.requireTestPlan,
      minLeadTimeHours: configuration.minLeadTimeHours,
    };
  }

  /**
   * Owner picker: active users holding `change.manage` **for the unit of the
   * change** (W7.66, BA-changes-10). Without a unit the viewer's home unit is
   * used, so the picker never offers a foreign scoped manager.
   */
  async searchOwners(viewer: ChangeViewer, search: string, organizationalUnitId?: string) {
    await this.access.require(viewer, permissionKeys.changeManage);
    const text = search.trim().slice(0, changeLimits.searchMax);
    const unitId = organizationalUnitId ?? viewer.homeOrganizationalUnitId ?? null;
    if (unitId === null) return { items: [] };
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: unitId },
      select: { ouPath: true },
    });
    if (unit === null) return { items: [] };
    const candidates = await this.prisma.user.findMany({
      where: {
        ...this.managerWhere(),
        ...(text.length > 0
          ? { OR: [{ displayName: { contains: text, mode: 'insensitive' as const } }, { email: { contains: text, mode: 'insensitive' as const } }] }
          : {}),
      },
      select: userSelect,
      orderBy: { displayName: 'asc' },
      // Over-fetch so the in-memory scope filter still fills a full page.
      take: 60,
    });
    const eligible = await eligibleChangeOwnerIds(
      this.prisma,
      candidates.map((candidate) => candidate.id),
      unit.ouPath,
    );
    return { items: candidates.filter((candidate) => eligible.has(candidate.id)).slice(0, 20) };
  }

  /**
   * §11 link picker: equipment by tag, name or serial number. Only while the
   * CMDB is on; at least two characters, at most 10 results.
   */
  async searchAssets(viewer: ChangeViewer, search: string) {
    await this.access.require(viewer, permissionKeys.changeRequest);
    if (!(await this.access.cmdbEnabled())) return { items: [] };
    const term = search.trim().slice(0, changeLimits.searchMax);
    if (term.length < 2) return { items: [] };
    // BA-changes-02: `change.request` does not widen the CMDB. The picker is a
    // CMDB read, so it needs `asset.read` in the asset's unit; otherwise the
    // viewer cannot even learn that a tag exists.
    const access = await assetLinkAccess(this.prisma, viewer.userId);
    if (!access.allowed) return { items: [] };
    const items = await this.prisma.asset.findMany({
      where: {
        AND: [
          assetLinkWhere(access),
          {
            OR: [
              { assetTag: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
              { serialNumber: { contains: term, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: { id: true, assetTag: true, name: true },
      orderBy: { assetTag: 'asc' },
      take: 10,
    });
    return { items };
  }

  /**
   * §11 link picker: problems that are not closed or cancelled, by number or
   * title. Only while the problem module is on; at most 10 results.
   */
  async searchProblems(viewer: ChangeViewer, search: string) {
    await this.access.require(viewer, permissionKeys.changeRequest);
    if (!(await this.access.problemsEnabled()) || !this.access.hasPermission(viewer, permissionKeys.problemRead)) return { items: [] };
    const term = search.trim().slice(0, changeLimits.searchMax);
    if (term.length < 1) return { items: [] };
    // Same visibility as the problem register (3.3 §12).
    const visible = problemVisibilityWhere(await this.access.scopeOf(viewer, permissionKeys.problemRead), viewer.userId);
    const prefix = await this.access.problemNumberPrefix();
    const sequence = parseProblemNumberSearch(term, prefix);
    const rows = await this.prisma.problem.findMany({
      where: {
        status: { notIn: ['CLOSED', 'CANCELLED'] },
        ...(visible === null ? {} : { AND: [visible] }),
        OR: [{ title: { contains: term, mode: 'insensitive' } }, ...(sequence === null ? [] : [{ sequence }])],
      },
      select: { id: true, sequence: true, title: true, status: true },
      orderBy: { sequence: 'desc' },
      take: 10,
    });
    return { items: rows.map((row) => ({ id: row.id, number: formatProblemNumber(prefix, row.sequence), title: row.title, status: row.status })) };
  }

  /** Loads a change visible to the viewer; anything else reads as not found. */
  async loadInScope(id: string, scope: ChangeScope, viewer: ChangeViewer): Promise<ChangeDetailRow> {
    const visible = changeVisibilityWhere(scope, viewer.userId);
    const row = await this.prisma.changeRequest.findFirst({
      where: { id, ...(visible === null ? {} : visible) },
      select: detailSelect,
    });
    if (row === null) throw new ChangeError(changeErrorCodes.notFound);
    return row;
  }

  /** change.manage in the unit scope of the change (change managers: every unit). */
  async canManage(viewer: ChangeViewer, row: { organizationalUnit: { ouPath: string } }): Promise<boolean> {
    if (!this.access.hasPermission(viewer, permissionKeys.changeManage)) return false;
    return isPathInScope(await this.access.scopeOf(viewer, permissionKeys.changeManage), row.organizationalUnit.ouPath);
  }

  private isRequester(viewer: ChangeViewer, row: { requesterUserId: string | null }): boolean {
    return row.requesterUserId === viewer.userId && this.access.hasPermission(viewer, permissionKeys.changeRequest);
  }

  /** §6: the requester edits the draft; change.manage edits DRAFT/ASSESSMENT, and window/owner when SCHEDULED. */
  private async editScopeFor(viewer: ChangeViewer, row: ChangeDetailRow): Promise<'all' | 'window' | 'none'> {
    const byStatus = changeEditScope(row.status);
    if (byStatus === 'none') return 'none';
    if (await this.canManage(viewer, row)) return byStatus;
    return row.status === 'DRAFT' && this.isRequester(viewer, row) ? 'all' : 'none';
  }

  private async assertActionAllowed(viewer: ChangeViewer, row: ChangeDetailRow, action: ChangeActionValue): Promise<void> {
    if (await this.canManage(viewer, row)) return;
    if (isRequesterAction(action, row.status) && this.isRequester(viewer, row)) return;
    throw new ChangeError(changeErrorCodes.forbidden, action);
  }

  private async allowedActions(viewer: ChangeViewer, row: ChangeDetailRow, canManage: boolean): Promise<ChangeActionValue[]> {
    const available = availableChangeActions(row.type, row.status);
    if (canManage) return available;
    if (!this.isRequester(viewer, row)) return [];
    return available.filter((action) => isRequesterAction(action, row.status));
  }

  private managerWhere(): Prisma.UserWhereInput {
    return {
      isActive: true,
      anonymizedAt: null,
      userRoles: { some: { role: { rolePermissions: { some: { permission: { key: permissionKeys.changeManage } } } } } },
    };
  }

  private async defaultCabGroupId(): Promise<string | null> {
    const group = await this.prisma.group.findFirst({ where: { isCabGroup: true }, select: { id: true }, orderBy: { name: 'asc' } });
    return group?.id ?? null;
  }

  private async assertReferences(viewer: ChangeViewer, input: {
    serviceIds?: readonly string[];
    assetIds?: readonly string[];
    problemId?: string | null;
    ownerUserId?: string | null;
    cabGroupId?: string | null;
    /** W7.66: the unit the change belongs to (or moves to). */
    organizationalUnitId?: string;
  }): Promise<void> {
    if (input.serviceIds && input.serviceIds.length > 0) {
      const found = await this.prisma.service.count({ where: { id: { in: [...input.serviceIds] } } });
      if (found !== input.serviceIds.length) throw new ChangeError(changeErrorCodes.serviceNotFound);
    }
    if (input.assetIds && input.assetIds.length > 0) {
      // §11: affected CMDB items only while the CMDB module is on.
      if (!(await this.access.cmdbEnabled())) throw new ChangeError(changeErrorCodes.assetNotFound, 'cmdb_disabled');
      // BA-changes-02: a write link needs `asset.read` in the asset's unit. A
      // foreign or out-of-scope id fails exactly like a missing one, so the
      // error never confirms that the asset exists.
      const access = await assetLinkAccess(this.prisma, viewer.userId);
      const found = await this.prisma.asset.count({
        where: { AND: [assetLinkWhere(access), { id: { in: [...input.assetIds] } }] },
      });
      if (found !== input.assetIds.length) throw new ChangeError(changeErrorCodes.assetNotFound);
    }
    if (input.problemId) {
      if (!(await this.access.problemsEnabled())) throw new ChangeError(changeErrorCodes.problemNotFound, 'problems_disabled');
      // BA-changes-03: a direct problem id repeats the whole link policy of the
      // picker — `problem.read` visibility *and* an open status. A foreign id
      // still reads as not found, so the error never confirms it exists.
      const status = await this.problemLinkStatus(viewer, input.problemId);
      if (status === null) throw new ChangeError(changeErrorCodes.problemNotFound);
      if (problemFinalStatuses.includes(status)) throw new ChangeError(changeErrorCodes.problemClosed, status);
    }
    if (input.ownerUserId) {
      await this.assertOwnerEligible(input.ownerUserId, input.organizationalUnitId);
    }
    if (input.cabGroupId) {
      const group = await this.prisma.group.findUnique({ where: { id: input.cabGroupId }, select: { isCabGroup: true } });
      if (group === null) throw new ChangeError(changeErrorCodes.groupNotFound);
      if (!group.isCabGroup) throw new ChangeError(changeErrorCodes.notCabGroup);
    }
  }

  /**
   * W7.66 (`BA-changes-10`): holding `change.manage` somewhere is not enough —
   * the assignment must cover the unit the change belongs to (or moves to). The
   * scope comes from the same resolver `canManage` uses, so the picker, the
   * write validation and the drift reconciler cannot disagree with access.
   */
  async assertOwnerEligible(ownerUserId: string, organizationalUnitId?: string): Promise<void> {
    const unitPath =
      organizationalUnitId === undefined
        ? null
        : (
            await this.prisma.organizationalUnit.findUnique({
              where: { id: organizationalUnitId },
              select: { ouPath: true },
            })
          )?.ouPath ?? null;
    if (unitPath === null) throw new ChangeError(changeErrorCodes.unitNotFound);
    const eligibility = await changeOwnerEligibility(this.prisma, ownerUserId, unitPath);
    if (!eligibility.eligible) {
      throw new ChangeError(changeErrorCodes.ownerNotManager, eligibility.reason);
    }
  }

  toListItem(row: ListRow, configuration: ChangeConfiguration, assetCount?: number) {
    return {
      id: row.id,
      number: formatChangeNumber(configuration.numberPrefix, row.sequence),
      title: row.title,
      type: row.type,
      status: row.status,
      risk: row.risk,
      plannedStart: row.plannedStart?.toISOString() ?? null,
      plannedEnd: row.plannedEnd?.toISOString() ?? null,
      causesDowntime: row.causesDowntime,
      owner: row.owner,
      requester: row.requester,
      cabGroup: row.cabGroup,
      organizationalUnit: row.organizationalUnit,
      services: row.services.map((link) => link.service),
      serviceCount: row._count.services,
      // BA-changes-02: the stored count also feeds the lifecycle rules, so the
      // response uses the scoped count instead of the raw one.
      assetCount: assetCount ?? row._count.assets,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * BA-changes-03: the write-side twin of the problem picker. Returns the
   * problem status when the viewer may read the problem, `null` otherwise
   * (missing `problem.read`, module off, out of scope or a foreign id).
   */
  private async problemLinkStatus(viewer: ChangeViewer, problemId: string): Promise<ProblemStatusValue | null> {
    if (!this.access.hasPermission(viewer, permissionKeys.problemRead) || !(await this.access.problemsEnabled())) return null;
    const scope = await this.access.scopeOf(viewer, permissionKeys.problemRead);
    const visible = problemVisibilityWhere(scope, viewer.userId);
    const row = await this.prisma.problem.findFirst({
      where: { AND: [{ id: problemId }, ...(visible === null ? [] : [visible])] },
      select: { status: true },
    });
    return row?.status ?? null;
  }

  private async canReadProblem(viewer: ChangeViewer, problemId: string): Promise<boolean> {
    if (!this.access.hasPermission(viewer, permissionKeys.problemRead) || !(await this.access.problemsEnabled())) return false;
    const scope = await this.access.scopeOf(viewer, permissionKeys.problemRead);
    const visible = problemVisibilityWhere(scope, viewer.userId);
    return (await this.prisma.problem.count({ where: { id: problemId, ...(visible === null ? {} : visible) } })) > 0;
  }

  /**
   * W7.65 (`BA-changes-09`): which projection this viewer gets. The visibility
   * exception (requester, owner, CAB member) is a *participation* right, not a
   * licence to read the whole planning document of a change from another unit.
   */
  async detailLevelFor(viewer: ChangeViewer, row: ChangeDetailRow, scope: ChangeScope): Promise<ChangeDetailLevel> {
    const isRequester = row.requesterUserId === viewer.userId;
    const isOwner = row.ownerUserId === viewer.userId;
    const canApprove = this.access.hasPermission(viewer, permissionKeys.changeApprove);
    if (isPathInScope(scope, row.organizationalUnit.ouPath)) {
      return changeDetailLevel({ inScope: true, isRequester, isOwner, isCabMember: false, canApprove });
    }
    if (isRequester || isOwner) {
      return changeDetailLevel({ inScope: false, isRequester, isOwner, isCabMember: false, canApprove });
    }
    // Only pay for the membership query when the row is reachable at all.
    const isCabMember = await this.access.isCabGroupMember(viewer, row.cabGroupId);
    return changeDetailLevel({ inScope: false, isRequester, isOwner, isCabMember, canApprove });
  }

  /**
   * W7.65: role-specific projection. `full` readers (inside the unit scope of
   * `change.read`) still get everything; participants get the plan they are
   * accountable for, CAB voters get the plans they must evaluate, and everyone
   * else gets the lifecycle record. Hidden fields are named in `redactedFields`
   * so a client can say "hidden" instead of rendering an empty plan.
   */
  private async toDetail(
    viewer: ChangeViewer,
    row: ChangeDetailRow,
    configuration: ChangeConfiguration,
    level: ChangeDetailLevel,
  ) {
    const showPlan = level === 'full' || level === 'participant' || level === 'voter';
    const showOutcome = level === 'full' || level === 'participant';
    const showLinks = level === 'full';
    const assets = showLinks ? visibleAssets(await assetLinkAccess(this.prisma, viewer.userId), row) : [];
    const canManage = await this.canManage(viewer, row);
    const editScope = await this.editScopeFor(viewer, row);
    const visibleProblem =
      showLinks && row.problem !== null && (await this.canReadProblem(viewer, row.problem.id)) ? row.problem : null;
    // W7.66: a revocation or a deactivation after the assignment must not leave
    // a silently trusted owner — the client can show "no longer eligible".
    const ownerEligible =
      row.ownerUserId === null
        ? null
        : (await changeOwnerEligibility(this.prisma, row.ownerUserId, row.organizationalUnit.ouPath))
            .eligible;
    const problemPrefix = visibleProblem === null ? null : await this.access.problemNumberPrefix();
    const planFields = [
      'description',
      'reason',
      'impact',
      'likelihood',
      'implementationPlan',
      'backoutPlan',
      'testPlan',
      'communicationPlan',
    ];
    const outcomeFields = ['actualStart', 'actualEnd', 'outcome', 'reviewNotes', 'cancelReason'];
    const redactedFields = [
      ...(showPlan ? [] : planFields),
      ...(showOutcome ? [] : outcomeFields),
      ...(showLinks ? [] : ['assets', 'problem']),
      ...(showOutcome ? [] : ['template']),
    ];
    return {
      ...this.toListItem(row, configuration, showLinks ? assets.length : undefined),
      detailLevel: level,
      redactedFields,
      description: showPlan ? row.description : null,
      reason: showPlan ? row.reason : null,
      impact: showPlan ? row.impact : null,
      likelihood: showPlan ? row.likelihood : null,
      implementationPlan: showPlan ? row.implementationPlan : null,
      backoutPlan: showPlan ? row.backoutPlan : null,
      testPlan: showPlan ? row.testPlan : null,
      communicationPlan: showPlan ? row.communicationPlan : null,
      actualStart: showOutcome ? (row.actualStart?.toISOString() ?? null) : null,
      actualEnd: showOutcome ? (row.actualEnd?.toISOString() ?? null) : null,
      outcome: showOutcome ? row.outcome : null,
      reviewNotes: showOutcome ? row.reviewNotes : null,
      template: showOutcome ? row.template : null,
      problem:
        visibleProblem === null
          ? null
          : { id: visibleProblem.id, number: formatProblemNumber(problemPrefix ?? '', visibleProblem.sequence), title: visibleProblem.title, status: visibleProblem.status },
      assets,
      approvalRound: row.approvalRound,
      conflictsAcknowledgedAt: row.conflictsAcknowledgedAt?.toISOString() ?? null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      authorizedAt: row.authorizedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelReason: showOutcome ? row.cancelReason : null,
      version: row.version,
      ownerEligible,
      allowedActions: await this.allowedActions(viewer, row, canManage),
      permissions: {
        canManage,
        canEdit: editScope !== 'none',
        editScope,
        canClaim: canManage && row.ownerUserId !== viewer.userId && !changeFinalStatuses.includes(row.status),
      },
    };
  }
}
