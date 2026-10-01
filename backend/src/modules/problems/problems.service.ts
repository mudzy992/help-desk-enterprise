import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { isPathInScope, unitScopeWhere } from '../assets/asset-viewer';
import { permissionKeys } from '../authorization/authorization.constants';
import { resolveTicketPriority } from '../tickets/resolve-ticket-priority';
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
import { linkedTicketWorkWhere, problemVisibilityWhere } from './problem-visibility';

export type ProblemListQuery = {
  readonly search?: string;
  readonly status?: readonly ProblemStatusValue[];
  readonly priority?: readonly ProblemSeverityValue[];
  /** "me" = the viewer. */
  readonly ownerUserId?: string;
  readonly groupId?: string;
  readonly organizationalUnitId?: string;
  readonly serviceId?: string;
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
  _count: { select: { tickets: true } },
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
  ) {}

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
    return {
      items: page.map((row) => this.toListItem(row, configuration)),
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
    const events = await this.prisma.problemEvent.findMany({
      where: { problemId: id },
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

  async create(viewer: ProblemViewer, input: CreateProblemDto) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    const configuration = await this.access.configuration();
    const unitId = optionalId(input.organizationalUnitId) ?? viewer.homeOrganizationalUnitId;
    if (!unitId) throw new ProblemError(problemErrorCodes.validation, 'organizationalUnitId');
    await this.access.requireUnitInScope(scope, unitId);
    const ownerUserId = optionalId(input.ownerUserId) ?? null;
    const groupId = optionalId(input.groupId) ?? null;
    const serviceId = optionalId(input.serviceId) ?? null;
    await this.assertReferences({ ownerUserId, groupId, serviceId });
    const impact = input.impact ?? 'MEDIUM';
    const urgency = input.urgency ?? 'MEDIUM';
    const priority = await resolveTicketPriority(this.prisma, impact, urgency);
    const title = input.title.trim();
    const description = input.description.trim();
    if (title.length < 3) throw new ProblemError(problemErrorCodes.validation, 'title');
    if (description.length === 0) throw new ProblemError(problemErrorCodes.validation, 'description');

    const id = await this.prisma.$transaction(async (transaction) => {
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
          createdByUserId: viewer.userId,
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
        metadata: { sequence, organizationalUnitId: unitId, priority } as never,
        actorUserId: viewer.userId,
      });
      return created.id;
    });
    return this.get(viewer, id);
  }

  async update(viewer: ProblemViewer, id: string, input: UpdateProblemDto) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    const configuration = await this.access.configuration();
    const current = await this.loadInScope(id, scope, viewer);
    if ((problemFinalStatuses as readonly string[]).includes(current.status)) throw new ProblemError(problemErrorCodes.finalStatus);
    if (input.version !== current.version) throw new ProblemError(problemErrorCodes.versionConflict);

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
      data.organizationalUnitId = unitId;
    }
    const ownerUserId = optionalId(input.ownerUserId);
    const groupId = optionalId(input.groupId);
    const serviceId = optionalId(input.serviceId);
    await this.assertReferences({
      ownerUserId: ownerUserId !== current.ownerUserId ? ownerUserId : undefined,
      groupId: groupId !== current.groupId ? groupId : undefined,
      serviceId: serviceId !== current.serviceId ? serviceId : undefined,
    });
    if (ownerUserId !== undefined) {
      if (ownerUserId === null && current.status !== 'NEW') throw new ProblemError(problemErrorCodes.requirementMissing, 'owner');
      data.ownerUserId = ownerUserId;
    }
    if (groupId !== undefined) data.groupId = groupId;
    if (serviceId !== undefined) data.serviceId = serviceId;
    if (input.impact !== undefined || input.urgency !== undefined) {
      data.impact = input.impact ?? current.impact;
      data.urgency = input.urgency ?? current.urgency;
      data.priority = await resolveTicketPriority(this.prisma, data.impact, data.urgency);
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
    if (Object.keys(changes).length === 0 && textChanged.length === 0) return this.toDetail(viewer, current, configuration);

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
    });
    return this.get(viewer, id);
  }

  async changeStatus(viewer: ProblemViewer, id: string, input: ProblemStatusDto) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    const configuration = await this.access.configuration();
    const current = await this.loadInScope(id, scope, viewer);
    if (input.version !== current.version) throw new ProblemError(problemErrorCodes.versionConflict);
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
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ProblemError(problemErrorCodes.versionConflict);
      await transaction.problemEvent.create({
        data: { problemId: id, action: problemEventActions.status, actorUserId: viewer.userId, detail: { from, to, reason } },
      });
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action,
        entityType: auditLogEntityTypes.problem,
        entityId: id,
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
      this.prisma.service.findMany({
        where: { lifecycle: { not: 'DEPRECATED' } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 2000,
      }),
      this.prisma.group.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 2000 }),
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

  /** Owner picker: active users holding `problem.manage` through a role (§12). */
  async searchOwners(viewer: ProblemViewer, search: string) {
    await this.access.require(viewer, permissionKeys.problemManage);
    const text = search.trim().slice(0, problemLimits.searchMax);
    if (text.length < 2) return { items: [] };
    const items = await this.prisma.user.findMany({
      where: {
        isActive: true,
        anonymizedAt: null,
        userRoles: { some: { role: { rolePermissions: { some: { permission: { key: permissionKeys.problemManage } } } } } },
        OR: [{ displayName: { contains: text, mode: 'insensitive' } }, { email: { contains: text, mode: 'insensitive' } }],
      },
      select: userSelect,
      orderBy: { displayName: 'asc' },
      take: 20,
    });
    return { items };
  }

  /**
   * Loads a problem visible to the viewer (unit scope or a linked ticket the
   * viewer works on, §12); anything else reads as not found.
   */
  private async loadInScope(id: string, scope: ProblemScope, viewer: ProblemViewer): Promise<DetailRow> {
    const visible = problemVisibilityWhere(scope, viewer.userId);
    const row = await this.prisma.problem.findFirst({
      where: { id, ...(visible === null ? {} : visible) },
      select: detailSelect,
    });
    if (row === null) throw new ProblemError(problemErrorCodes.notFound);
    return row;
  }

  private async assertReferences(input: {
    ownerUserId?: string | null;
    groupId?: string | null;
    serviceId?: string | null;
  }): Promise<void> {
    const [owner, group, service] = await Promise.all([
      input.ownerUserId ? this.prisma.user.findUnique({ where: { id: input.ownerUserId }, select: { id: true, isActive: true } }) : null,
      input.groupId ? this.prisma.group.findUnique({ where: { id: input.groupId }, select: { id: true } }) : null,
      input.serviceId ? this.prisma.service.findUnique({ where: { id: input.serviceId }, select: { id: true } }) : null,
    ]);
    if (input.ownerUserId && (owner === null || !owner.isActive)) throw new ProblemError(problemErrorCodes.userNotFound);
    if (input.groupId && group === null) throw new ProblemError(problemErrorCodes.groupNotFound);
    if (input.serviceId && service === null) throw new ProblemError(problemErrorCodes.serviceNotFound);
  }

  private toListItem(row: ListRow, configuration: ProblemConfiguration) {
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
      ticketCount: row._count.tickets,
      targetAt: row.targetAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async toDetail(viewer: ProblemViewer, row: DetailRow, configuration: ProblemConfiguration) {
    let worksOnLinked: boolean | null = null;
    const inScope = async (permission: string) => {
      if (!this.access.hasPermission(viewer, permission)) return false;
      if (isPathInScope(await this.access.scopeOf(viewer, permission), row.organizationalUnit.ouPath)) return true;
      worksOnLinked ??= (await this.prisma.problemTicket.count({ where: { problemId: row.id, ticket: linkedTicketWorkWhere(viewer.userId) } })) > 0;
      return worksOnLinked;
    };
    const canManage = await inScope(permissionKeys.problemManage);
    const canClose = canManage && (await inScope(permissionKeys.problemClose));
    const transitions = canManage
      ? allowedProblemTransitions(row.status).filter((to) => canClose || !transitionNeedsClosePermission(row.status, to))
      : [];
    return {
      ...this.toListItem(row, configuration),
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
      allowedTransitions: transitions,
      permissions: { canManage, canClose },
    };
  }
}
