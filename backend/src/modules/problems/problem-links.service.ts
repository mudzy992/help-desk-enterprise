import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';
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

  private async event(problemId: string, viewer: ProblemViewer, action: string, detail: Record<string, unknown>) {
    await this.prisma.problemEvent.create({ data: { problemId, action, actorUserId: viewer.userId, detail: detail as never } });
  }

  async get(problemId: string, viewer: ProblemViewer) {
    const problem = await this.loadProblem(problemId, viewer);
    const [cmdbEnabled, statusEnabled, canEdit] = await Promise.all([
      this.access.cmdbEnabled(),
      this.access.statusPageEnabled(),
      this.canEdit(viewer, problem),
    ]);
    const services = await this.prisma.problemService.findMany({
      where: { problemId },
      select: { service: { select: { id: true, name: true } } },
      orderBy: { service: { name: 'asc' } },
      take: listLimit,
    });
    const assets = cmdbEnabled
      ? await this.prisma.problemAsset.findMany({ where: { problemId }, orderBy: { linkedAt: 'desc' }, take: listLimit, select: { linkedAt: true, asset: { select: assetSelect } } })
      : [];
    const incidents = statusEnabled
      ? await this.prisma.problemIncident.findMany({ where: { problemId }, orderBy: { linkedAt: 'desc' }, take: listLimit, select: { incident: { select: incidentSelect } } })
      : [];
    return {
      cmdbEnabled,
      statusEnabled,
      canEdit,
      assets: assets.map((link) => ({ ...toAsset(link.asset), linkedAt: link.linkedAt.toISOString() })),
      suggestedAssets: cmdbEnabled ? await this.suggestAssets(problemId) : [],
      services: services.map((link) => link.service),
      incidents: incidents.map((link) => toIncident(link.incident)),
    };
  }

  /** Items attached to the problem's tickets, most frequent first, not yet linked. */
  private async suggestAssets(problemId: string) {
    const counts = await this.prisma.ticketAsset.groupBy({
      by: ['assetId'],
      where: { ticket: { problemLink: { is: { problemId } } }, asset: { problems: { none: { problemId } } } },
      _count: { _all: true },
      orderBy: { _count: { assetId: 'desc' } },
      take: suggestionLimit,
    });
    if (counts.length === 0) return [];
    const rows = await this.prisma.asset.findMany({ where: { id: { in: counts.map((row) => row.assetId) } }, select: assetSelect });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return counts.flatMap((count) => {
      const row = byId.get(count.assetId);
      return row === undefined ? [] : [{ ...toAsset(row), ticketCount: count._count._all }];
    });
  }

  async searchAssets(problemId: string, viewer: ProblemViewer, search: string) {
    await this.requireEditable(problemId, viewer);
    if (!(await this.access.cmdbEnabled())) return { items: [] };
    const term = search.trim().slice(0, problemLimits.searchMax);
    if (term.length < 2) return { items: [] };
    const rows = await this.prisma.asset.findMany({
      where: {
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
    const unique = [...new Set(assetIds)].slice(0, problemLimits.linkBatchMax);
    const assets = await this.prisma.asset.findMany({ where: { id: { in: unique } }, select: { id: true, assetTag: true, name: true } });
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
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId }, select: { assetTag: true, name: true } });
    const removed = await this.prisma.problemAsset.deleteMany({ where: { problemId, assetId } });
    if (removed.count === 0) throw new ProblemError(problemErrorCodes.assetNotFound);
    await this.event(problemId, viewer, problemEventActions.assetUnlinked, { assetId, assetTag: asset?.assetTag ?? null, name: asset?.name ?? null });
  }

  async linkService(problemId: string, viewer: ProblemViewer, serviceId: string) {
    const problem = await this.requireEditable(problemId, viewer);
    const service = await this.prisma.service.findUnique({ where: { id: serviceId }, select: { id: true, name: true } });
    if (service === null) throw new ProblemError(problemErrorCodes.serviceNotFound);
    // The main service is already on the problem itself.
    if (problem.serviceId === serviceId) return { linked: 0 };
    try {
      await this.prisma.problemService.create({ data: { problemId, serviceId } });
    } catch (error) {
      if (isUniqueViolation(error)) return { linked: 0 };
      throw error;
    }
    await this.event(problemId, viewer, problemEventActions.serviceLinked, { serviceId, name: service.name });
    return { linked: 1 };
  }

  async unlinkService(problemId: string, viewer: ProblemViewer, serviceId: string) {
    await this.requireEditable(problemId, viewer);
    const service = await this.prisma.service.findUnique({ where: { id: serviceId }, select: { name: true } });
    const removed = await this.prisma.problemService.deleteMany({ where: { problemId, serviceId } });
    if (removed.count === 0) throw new ProblemError(problemErrorCodes.serviceNotFound);
    await this.event(problemId, viewer, problemEventActions.serviceUnlinked, { serviceId, name: service?.name ?? null });
  }

  async searchIncidents(problemId: string, viewer: ProblemViewer, search: string) {
    await this.requireEditable(problemId, viewer);
    if (!(await this.access.statusPageEnabled())) return { items: [] };
    const term = search.trim().slice(0, problemLimits.searchMax);
    const since = new Date(Date.now() - incidentSearchWindowDays * 86_400_000);
    const rows = await this.prisma.serviceIncident.findMany({
      where: {
        problems: { none: { problemId } },
        OR: [{ resolvedAt: null }, { resolvedAt: { gte: since } }],
        ...(term.length > 0 ? { title: { contains: term, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: searchLimit,
      select: incidentSelect,
    });
    return { items: rows.map(toIncident) };
  }

  async linkIncident(problemId: string, viewer: ProblemViewer, incidentId: string) {
    await this.requireEditable(problemId, viewer);
    if (!(await this.access.statusPageEnabled())) throw new ProblemError(problemErrorCodes.incidentNotFound);
    const incident = await this.prisma.serviceIncident.findUnique({ where: { id: incidentId }, select: { id: true, title: true } });
    if (incident === null) throw new ProblemError(problemErrorCodes.incidentNotFound);
    try {
      await this.prisma.problemIncident.create({ data: { problemId, incidentId } });
    } catch (error) {
      if (isUniqueViolation(error)) return { linked: 0 };
      throw error;
    }
    await this.event(problemId, viewer, problemEventActions.incidentLinked, { incidentId, title: incident.title });
    return { linked: 1 };
  }

  async unlinkIncident(problemId: string, viewer: ProblemViewer, incidentId: string) {
    await this.requireEditable(problemId, viewer);
    const incident = await this.prisma.serviceIncident.findUnique({ where: { id: incidentId }, select: { title: true } });
    const removed = await this.prisma.problemIncident.deleteMany({ where: { problemId, incidentId } });
    if (removed.count === 0) throw new ProblemError(problemErrorCodes.incidentNotFound);
    await this.event(problemId, viewer, problemEventActions.incidentUnlinked, { incidentId, title: incident?.title ?? null });
  }

  /**
   * Reverse side for the asset card and the incident card: problems the viewer
   * may see. Without the module or `problem.read` the answer is simply empty,
   * so those screens never fail because of this module.
   */
  async forAsset(assetId: string, viewer: ProblemViewer) {
    return this.reverse(viewer, { assets: { some: { assetId } } });
  }

  async forIncident(incidentId: string, viewer: ProblemViewer) {
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
