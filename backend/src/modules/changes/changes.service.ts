import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { isPathInScope, unitScopeWhere } from '../assets/asset-viewer';
import { permissionKeys } from '../authorization/authorization.constants';
import { formatProblemNumber } from '../problems/problem-rules';
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
import { hasWarnings } from './change-conflicts';
import { ChangeNotifier } from './change-notifier';
import { ChangeScheduleService } from './change-schedule.service';
import { changeVisibilityWhere } from './change-visibility';
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
  assets: { select: { asset: { select: { id: true, assetTag: true, name: true } } } },
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
    if (query.problemId) and.push({ problemId: query.problemId });
    if (query.assetId) and.push({ assets: { some: { assetId: query.assetId } } });
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
    // awaitingMyVote: drop changes the viewer already voted on in the current round.
    const voted = query.awaitingMyVote ? await this.votedChangeIds(viewer.userId, page) : new Set<string>();
    return {
      items: page.filter((row) => !voted.has(row.id)).map((row) => this.toListItem(row, configuration)),
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
    return this.toDetail(viewer, row, await this.access.configuration());
  }

  async events(viewer: ChangeViewer, id: string) {
    const scope = await this.access.require(viewer, permissionKeys.changeRead);
    await this.loadInScope(id, scope, viewer);
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
        detail: event.detail,
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
    await this.assertReferences({ serviceIds, assetIds, problemId, ownerUserId, cabGroupId });
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
    await this.assertReferences({
      serviceIds: serviceIds?.filter((serviceId) => !current.services.some((link) => link.service.id === serviceId)),
      assetIds: assetIds?.filter((assetId) => !current.assets.some((link) => link.asset.id === assetId)),
      problemId: data.problemId as string | null | undefined,
      ownerUserId: data.ownerUserId as string | null | undefined,
      cabGroupId: data.cabGroupId as string | null | undefined,
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
    const removedAssets = assetIds === undefined ? [] : currentAssetIds.filter((value) => !assetIds.includes(value));
    const linksChanged = addedServices.length + removedServices.length + addedAssets.length + removedAssets.length > 0;
    if (Object.keys(changes).length === 0 && textChanged.length === 0 && !linksChanged) return this.toDetail(viewer, current, configuration);

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
    });
    if (reauthorize) {
      await this.schedule.release(id, viewer.userId, 'reschedule');
      this.notify('approval', (notifier) => notifier.approvalRequested(id, current.approvalRound + 1, viewer.userId));
    } else if (windowMoved && (changes.plannedStart || changes.plannedEnd)) {
      await this.schedule.syncDowntime(id, viewer.userId);
    }
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
    if (target === 'AUTHORIZATION') {
      // §8: someone other than the requester must be able to vote.
      const voters = current.cabGroupId === null ? [] : await loadCabVoterIds(this.prisma, current.cabGroupId);
      if (voters.filter((voterId) => voterId !== current.requesterUserId).length === 0) throw new ChangeError(changeErrorCodes.noApprovers);
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
          detail: { from, to: target, action: input.action, reason, outcome: input.outcome ?? null } as never,
        },
      });
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.changeStatusChanged,
        entityType: auditLogEntityTypes.change,
        entityId: id,
        metadata: { from, to: target, action: input.action, reason } as never,
        actorUserId: viewer.userId,
      });
    });
    await this.afterAction(viewer, current, input, target);
    return this.get(viewer, id);
  }

  /** Side effects after a committed action: downtime windows (§10) and notices (§12, §14). */
  private async afterAction(viewer: ChangeViewer, current: ChangeDetailRow, input: ChangeActionDto, target: ChangeStatusValue): Promise<void> {
    if (target === 'AUTHORIZATION') {
      this.notify('approval', (notifier) => notifier.approvalRequested(current.id, current.approvalRound, viewer.userId));
    }
    if (target === 'SCHEDULED') await this.schedule.syncDowntime(current.id, viewer.userId);
    if (input.action === 'cancel' || input.action === 'finish') await this.schedule.release(current.id, viewer.userId, input.action);
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
      return { changes: [], downtime: [], freeze: null, freezeBlocks: false, hasWarnings: false, acknowledgedAt: null };
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
    return { ...(await this.schedule.describe(conflicts, configuration)), acknowledgedAt: current.conflictsAcknowledgedAt?.toISOString() ?? null };
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

  /** Owner picker: active users holding change.manage through a role. */
  async searchOwners(viewer: ChangeViewer, search: string) {
    await this.access.require(viewer, permissionKeys.changeManage);
    const text = search.trim().slice(0, changeLimits.searchMax);
    const items = await this.prisma.user.findMany({
      where: {
        ...this.managerWhere(),
        ...(text.length > 0
          ? { OR: [{ displayName: { contains: text, mode: 'insensitive' as const } }, { email: { contains: text, mode: 'insensitive' as const } }] }
          : {}),
      },
      select: userSelect,
      orderBy: { displayName: 'asc' },
      take: 20,
    });
    return { items };
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

  private async assertReferences(input: {
    serviceIds?: readonly string[];
    assetIds?: readonly string[];
    problemId?: string | null;
    ownerUserId?: string | null;
    cabGroupId?: string | null;
  }): Promise<void> {
    if (input.serviceIds && input.serviceIds.length > 0) {
      const found = await this.prisma.service.count({ where: { id: { in: [...input.serviceIds] } } });
      if (found !== input.serviceIds.length) throw new ChangeError(changeErrorCodes.serviceNotFound);
    }
    if (input.assetIds && input.assetIds.length > 0) {
      // §11: affected CMDB items only while the CMDB module is on.
      if (!(await this.access.cmdbEnabled())) throw new ChangeError(changeErrorCodes.assetNotFound, 'cmdb_disabled');
      const found = await this.prisma.asset.count({ where: { id: { in: [...input.assetIds] } } });
      if (found !== input.assetIds.length) throw new ChangeError(changeErrorCodes.assetNotFound);
    }
    if (input.problemId) {
      if (!(await this.access.problemsEnabled())) throw new ChangeError(changeErrorCodes.problemNotFound, 'problems_disabled');
      if ((await this.prisma.problem.count({ where: { id: input.problemId } })) === 0) throw new ChangeError(changeErrorCodes.problemNotFound);
    }
    if (input.ownerUserId) {
      if ((await this.prisma.user.count({ where: { id: input.ownerUserId, ...this.managerWhere() } })) === 0) {
        throw new ChangeError(changeErrorCodes.ownerNotManager);
      }
    }
    if (input.cabGroupId) {
      const group = await this.prisma.group.findUnique({ where: { id: input.cabGroupId }, select: { isCabGroup: true } });
      if (group === null) throw new ChangeError(changeErrorCodes.groupNotFound);
      if (!group.isCabGroup) throw new ChangeError(changeErrorCodes.notCabGroup);
    }
  }

  toListItem(row: ListRow, configuration: ChangeConfiguration) {
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
      assetCount: row._count.assets,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async toDetail(viewer: ChangeViewer, row: ChangeDetailRow, configuration: ChangeConfiguration) {
    const canManage = await this.canManage(viewer, row);
    const editScope = await this.editScopeFor(viewer, row);
    const problemPrefix = row.problem === null ? null : await this.access.problemNumberPrefix();
    return {
      ...this.toListItem(row, configuration),
      description: row.description,
      reason: row.reason,
      impact: row.impact,
      likelihood: row.likelihood,
      implementationPlan: row.implementationPlan,
      backoutPlan: row.backoutPlan,
      testPlan: row.testPlan,
      communicationPlan: row.communicationPlan,
      actualStart: row.actualStart?.toISOString() ?? null,
      actualEnd: row.actualEnd?.toISOString() ?? null,
      outcome: row.outcome,
      reviewNotes: row.reviewNotes,
      template: row.template,
      problem:
        row.problem === null
          ? null
          : { id: row.problem.id, number: formatProblemNumber(problemPrefix ?? '', row.problem.sequence), title: row.problem.title, status: row.problem.status },
      assets: row.assets.map((link) => link.asset),
      approvalRound: row.approvalRound,
      conflictsAcknowledgedAt: row.conflictsAcknowledgedAt?.toISOString() ?? null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      authorizedAt: row.authorizedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
      version: row.version,
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
