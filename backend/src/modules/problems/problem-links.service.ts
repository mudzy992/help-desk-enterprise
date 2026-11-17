import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { problemTicketVisibility } from './problem-ticket-visibility';
import { problemCrossDomainVisibility } from './problem-cross-domain-visibility';
import { withIncidentVisibility } from '../status-page/status-page.service';
import { assetWhereOf, problemAssetAccess } from './problem-asset-access';
import { ProblemAccessService, type ProblemViewer } from './problem-access.service';
import { formatProblemNumber } from './problem-rules';
import { problemVisibilityWhere } from './problem-visibility';
import { problemErrorCodes, problemEventActions, problemFinalStatuses, problemLimits, ProblemError } from './problems.constants';

/** Suggestions and pickers stay short; the record lists are bounded too. */
const suggestionLimit = 20;
const searchLimit = 10;
const listLimit = 200;
/** Incident picker: unresolved ones plus those resolved in this window. */
const incidentSearchWindowDays = 180;

const assetSelect = {
  id: true,
  assetTag: true,
  name: true,
  status: true,
  type: { select: { nameBs: true, nameEn: true } },
  organizationalUnit: { select: { name: true } },
} as const;

const incidentSelect = { id: true, title: true, impact: true, status: true, startedAt: true, resolvedAt: true } as const;

type AssetRow = {
  id: string;
  assetTag: string;
  name: string;
  status: string;
  type: { nameBs: string; nameEn: string };
  organizationalUnit: { name: string };
};

function toAsset(row: AssetRow) {
  return {
    id: row.id,
    assetTag: row.assetTag,
    name: row.name,
    status: row.status,
    typeNameBs: row.type.nameBs,
    typeNameEn: row.type.nameEn,
    organizationalUnitName: row.organizationalUnit.name,
  };
}

function toIncident(row: { id: string; title: string; impact: string; status: string; startedAt: Date; resolvedAt: Date | null }) {
  return {
    id: row.id,
    title: row.title,
    impact: row.impact,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/**
 * Paket 3.3 P5b (§9): a problem's affected CMDB items, additional services and
 * status-page incidents. Reading follows `problem.read`; editing needs
 * `problem.manage` inside the problem group (decision 2026-10-01) and an open
 * problem. CMDB items and incidents only appear while their module is on;
 * stored links are kept when a module is switched off.
 */
@Injectable()
export class ProblemLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProblemAccessService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
  ) {}

  private async loadProblem(problemId: string, viewer: ProblemViewer) {
    const scope = await this.access.require(viewer, permissionKeys.problemRead);
    const visible = problemVisibilityWhere(scope, viewer.userId);
    const problem = await this.prisma.problem.findFirst({
      where: { id: problemId, ...(visible === null ? {} : visible) },
      select: { id: true, status: true, groupId: true, serviceId: true },
    });
    if (problem === null) throw new ProblemError(problemErrorCodes.notFound);
    return problem;
  }

  private async canEdit(viewer: ProblemViewer, problem: { status: string; groupId: string | null }): Promise<boolean> {
    if ((problemFinalStatuses as readonly string[]).includes(problem.status)) return false;
    return this.access.hasGroupAuthority(viewer, permissionKeys.problemManage, problem.groupId);
  }

  private async requireEditable(problemId: string, viewer: ProblemViewer) {
    const problem = await this.loadProblem(problemId, viewer);
    if ((problemFinalStatuses as readonly string[]).includes(problem.status)) throw new ProblemError(problemErrorCodes.finalStatus);
    await this.access.requireGroupAuthority(viewer, permissionKeys.problemManage, problem.groupId);
    return problem;
  }

  async get(problemId: string, viewer: ProblemViewer) {
    const problem = await this.loadProblem(problemId, viewer);
    const [cmdbEnabled, statusEnabled, canEdit, crossDomain] = await Promise.all([
      this.access.cmdbEnabled(),
      this.access.statusPageEnabled(),
      this.canEdit(viewer, problem),
      problemCrossDomainVisibility(this.authorizationContextLoader, viewer.userId),
    ]);
    // A service or incident the caller may not read in its own module does not
    // become readable because a problem links to it.
    const services = await this.prisma.problemService.findMany({
      where: { problemId, service: { is: crossDomain.serviceWhere } },
      select: { service: { select: { id: true, name: true } } },
      orderBy: { service: { name: 'asc' } },
      take: listLimit,
    });
    const assetAccess = cmdbEnabled ? await problemAssetAccess(this.prisma, viewer.userId) : null;
    const assets = cmdbEnabled
      ? await this.prisma.problemAsset.findMany({
          where: { problemId, asset: { is: assetWhereOf(assetAccess!) } },
          orderBy: { linkedAt: 'desc' },
          take: listLimit,
          select: { linkedAt: true, asset: { select: assetSelect } },
        })
      : [];
    const incidents = statusEnabled
      ? await this.prisma.problemIncident.findMany({
          where: withIncidentVisibility({ problemId }, crossDomain.incidents),
          orderBy: { linkedAt: 'desc' },
          take: listLimit,
          select: { incident: { select: incidentSelect } },
        })
      : [];
    return {
      cmdbEnabled,
      statusEnabled,
      canEdit,
      assets: assets.map((link) => ({ ...toAsset(link.asset), linkedAt: link.linkedAt.toISOString() })),
      suggestedAssets: cmdbEnabled ? await this.suggestAssets(problemId, viewer, assetAccess!) : [],
      services: services.map((link) => link.service),
      incidents: incidents.map((link) => toIncident(link.incident)),
    };
  }

  /** Items attached to the problem's tickets, most frequent first, not yet linked. */
  private async suggestAssets(problemId: string, viewer: ProblemViewer, assetAccess: Awaited<ReturnType<typeof problemAssetAccess>>) {
    const visibility = await problemTicketVisibility(this.prisma, this.authorizationContextLoader, this.accessPolicies, viewer.userId);
    const counts = await this.prisma.ticketAsset.groupBy({
      by: ['assetId'],
      where: { ticket: { is: { AND: [visibility, { problemLink: { is: { problemId } } }] } }, asset: { problems: { none: { problemId } } } },
      _count: { _all: true },
      orderBy: { _count: { assetId: 'desc' } },
      take: suggestionLimit,
    });
    if (counts.length === 0) return [];
    const rows = await this.prisma.asset.findMany({
      where: { AND: [assetWhereOf(assetAccess), { id: { in: counts.map((row) => row.assetId) } }] },
      select: assetSelect,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return counts.flatMap((count) => {
      const row = byId.get(count.assetId);
      return row === undefined ? [] : [{ ...toAsset(row), ticketCount: count._count._all }];
    });
  }

  async searchAssets(problemId: string, viewer: ProblemViewer, search: string) {
    await this.requireEditable(problemId, viewer);
    if (!(await this.access.cmdbEnabled())) return { items: [] };
    const assetAccess = await problemAssetAccess(this.prisma, viewer.userId);
    if (!assetAccess.allowed) return { items: [] };
    const term = search.trim().slice(0, problemLimits.searchMax);
    if (term.length < 2) return { items: [] };
    const rows = await this.prisma.asset.findMany({
      where: {
        AND: [assetWhereOf(assetAccess)],
        problems: { none: { problemId } },
        OR: [
          { assetTag: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { serialNumber: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: { assetTag: 'asc' },
      take: searchLimit,
      select: assetSelect,
    });
    return { items: rows.map(toAsset) };
  }

  async linkAssets(problemId: string, viewer: ProblemViewer, assetIds: readonly string[]) {
    await this.requireEditable(problemId, viewer);
    if (!(await this.access.cmdbEnabled())) throw new ProblemError(problemErrorCodes.assetNotFound);
    const assetAccess = await problemAssetAccess(this.prisma, viewer.userId);
    if (!assetAccess.allowed) throw new ProblemError(problemErrorCodes.assetNotFound);
    const unique = [...new Set(assetIds)].slice(0, problemLimits.linkBatchMax);
    const assets = await this.prisma.asset.findMany({
      where: { AND: [assetWhereOf(assetAccess), { id: { in: unique } }] },
      select: { id: true, assetTag: true, name: true },
    });
    if (assets.length !== unique.length) throw new ProblemError(problemErrorCodes.assetNotFound);
    let linked = 0;
    for (const asset of assets) {
      try {
        await this.prisma.$transaction(async (transaction) => {
          await transaction.problemAsset.create({ data: { problemId, assetId: asset.id } });
          await transaction.problemEvent.create({
            data: { problemId, action: problemEventActions.assetLinked, actorUserId: viewer.userId, detail: { assetId: asset.id, assetTag: asset.assetTag, name: asset.name } },
          });
        });
        linked += 1;
      } catch (error) {
        // Already linked (a parallel request or a stale picker): nothing to do.
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return { linked };
  }

  async unlinkAsset(problemId: string, viewer: ProblemViewer, assetId: string) {
    await this.requireEditable(problemId, viewer);
    const assetAccess = await problemAssetAccess(this.prisma, viewer.userId);
    if (!assetAccess.allowed) throw new ProblemError(problemErrorCodes.assetNotFound);
    const asset = await this.prisma.asset.findFirst({ where: { AND: [assetWhereOf(assetAccess), { id: assetId }] }, select: { assetTag: true, name: true } });
    if (asset === null) throw new ProblemError(problemErrorCodes.assetNotFound);
    // W7.29: the removal and its history line are one write, so a failed event
    // cannot leave a silent unlink (and a failed unlink cannot leave an event).
    await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.problemAsset.deleteMany({ where: { problemId, assetId } });
      if (removed.count === 0) throw new ProblemError(problemErrorCodes.assetNotFound);
      await transaction.problemEvent.create({
        data: {
          problemId,
          action: problemEventActions.assetUnlinked,
          actorUserId: viewer.userId,
          detail: { assetId, assetTag: asset.assetTag, name: asset.name } as never,
        },
      });
    });
  }

  /** The service must be one the catalog itself shows to this caller. */
  private async readableService(viewer: ProblemViewer, serviceId: string) {
    const crossDomain = await problemCrossDomainVisibility(this.authorizationContextLoader, viewer.userId);
    return this.prisma.service.findFirst({
      where: { AND: [{ id: serviceId }, crossDomain.serviceWhere] },
      select: { id: true, name: true },
    });
  }

  async linkService(problemId: string, viewer: ProblemViewer, serviceId: string) {
    const problem = await this.requireEditable(problemId, viewer);
    const service = await this.readableService(viewer, serviceId);
    if (service === null) throw new ProblemError(problemErrorCodes.serviceNotFound);
    // The main service is already on the problem itself.
    if (problem.serviceId === serviceId) return { linked: 0 };
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.problemService.create({ data: { problemId, serviceId } });
        await transaction.problemEvent.create({
          data: { problemId, action: problemEventActions.serviceLinked, actorUserId: viewer.userId, detail: { serviceId, name: service.name } as never },
        });
      });
    } catch (error) {
      // Already linked (a parallel request or a stale picker): nothing to write.
      if (isUniqueViolation(error)) return { linked: 0 };
      throw error;
    }
    return { linked: 1 };
  }

  async unlinkService(problemId: string, viewer: ProblemViewer, serviceId: string) {
    await this.requireEditable(problemId, viewer);
    const service = await this.readableService(viewer, serviceId);
    if (service === null) throw new ProblemError(problemErrorCodes.serviceNotFound);
    await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.problemService.deleteMany({ where: { problemId, serviceId } });
      if (removed.count === 0) throw new ProblemError(problemErrorCodes.serviceNotFound);
      await transaction.problemEvent.create({
        data: { problemId, action: problemEventActions.serviceUnlinked, actorUserId: viewer.userId, detail: { serviceId, name: service.name } as never },
      });
    });
  }

  async searchIncidents(problemId: string, viewer: ProblemViewer, search: string) {
    await this.requireEditable(problemId, viewer);
    if (!(await this.access.statusPageEnabled())) return { items: [] };
    const crossDomain = await problemCrossDomainVisibility(this.authorizationContextLoader, viewer.userId);
    const term = search.trim().slice(0, problemLimits.searchMax);
    const since = new Date(Date.now() - incidentSearchWindowDays * 86_400_000);
    const rows = await this.prisma.serviceIncident.findMany({
      // The status page owns incident visibility; a problem manager sees what
      // it would show them, not every STAFF_ONLY incident in the installation.
      where: withIncidentVisibility(
        {
          problems: { none: { problemId } },
          OR: [{ resolvedAt: null }, { resolvedAt: { gte: since } }],
          ...(term.length > 0 ? { title: { contains: term, mode: 'insensitive' as const } } : {}),
        },
        crossDomain.incidents,
      ),
      orderBy: { startedAt: 'desc' },
      take: searchLimit,
      select: incidentSelect,
    });
    return { items: rows.map(toIncident) };
  }

  /** The incident must be one the status page itself shows to this caller. */
  private async readableIncident(viewer: ProblemViewer, incidentId: string) {
    const crossDomain = await problemCrossDomainVisibility(this.authorizationContextLoader, viewer.userId);
    return this.prisma.serviceIncident.findFirst({
      where: withIncidentVisibility({ id: incidentId }, crossDomain.incidents),
      select: { id: true, title: true },
    });
  }

  async linkIncident(problemId: string, viewer: ProblemViewer, incidentId: string) {
    await this.requireEditable(problemId, viewer);
    if (!(await this.access.statusPageEnabled())) throw new ProblemError(problemErrorCodes.incidentNotFound);
    const incident = await this.readableIncident(viewer, incidentId);
    if (incident === null) throw new ProblemError(problemErrorCodes.incidentNotFound);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.problemIncident.create({ data: { problemId, incidentId } });
        await transaction.problemEvent.create({
          data: { problemId, action: problemEventActions.incidentLinked, actorUserId: viewer.userId, detail: { incidentId, title: incident.title } as never },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { linked: 0 };
      throw error;
    }
    return { linked: 1 };
  }

  async unlinkIncident(problemId: string, viewer: ProblemViewer, incidentId: string) {
    await this.requireEditable(problemId, viewer);
    const incident = await this.readableIncident(viewer, incidentId);
    if (incident === null) throw new ProblemError(problemErrorCodes.incidentNotFound);
    await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.problemIncident.deleteMany({ where: { problemId, incidentId } });
      if (removed.count === 0) throw new ProblemError(problemErrorCodes.incidentNotFound);
      await transaction.problemEvent.create({
        data: { problemId, action: problemEventActions.incidentUnlinked, actorUserId: viewer.userId, detail: { incidentId, title: incident.title } as never },
      });
    });
  }

  /**
   * Reverse side for the asset card and the incident card: problems the viewer
   * may see. Without the module or `problem.read` the answer is simply empty,
   * so those screens never fail because of this module.
   */
  async forAsset(assetId: string, viewer: ProblemViewer) {
    const assetAccess = await problemAssetAccess(this.prisma, viewer.userId);
    if (!assetAccess.allowed) return { items: [] };
    const readable = await this.prisma.asset.count({ where: { AND: [assetWhereOf(assetAccess), { id: assetId }] } });
    if (readable === 0) return { items: [] };
    return this.reverse(viewer, { assets: { some: { assetId } } });
  }

  async forIncident(incidentId: string, viewer: ProblemViewer) {
    const crossDomain = await problemCrossDomainVisibility(this.authorizationContextLoader, viewer.userId);
    const visible = await this.prisma.serviceIncident.count({
      where: withIncidentVisibility({ id: incidentId }, crossDomain.incidents),
    });
    if (visible === 0) return { items: [] };
    return this.reverse(viewer, { incidents: { some: { incidentId } } });
  }

  private async reverse(viewer: ProblemViewer, where: Record<string, unknown>) {
    const capabilities = await this.access.capabilities(viewer);
    if (!capabilities.enabled || !capabilities.canRead || capabilities.configuration === null) return { items: [] };
    const scope = await this.access.require(viewer, permissionKeys.problemRead);
    const visible = problemVisibilityWhere(scope, viewer.userId);
    const rows = await this.prisma.problem.findMany({
      where: { AND: [where, ...(visible === null ? [] : [visible])] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, sequence: true, title: true, status: true, priority: true },
    });
    const prefix = capabilities.configuration.numberPrefix;
    return {
      items: rows.map((row) => ({ id: row.id, number: formatProblemNumber(prefix, row.sequence), title: row.title, status: row.status, priority: row.priority })),
    };
  }
}
