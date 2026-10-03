import { PrismaService } from '../../../common/prisma/prisma.service';
import { loadTicketCsatSubmissions } from '../../tickets/csat/load-ticket-csat-submissions';
import { loadScopedReportTickets } from '../load-scoped-report-tickets';
import { resolveReportOrganizationalUnitScope } from '../resolve-report-organizational-unit-scope';
import { resolveReportWindow } from '../resolve-report-window';
import type { ReportScopeQuery, ReportsConfiguration } from '../reports.types';
import {
  aggregateAgingBuckets,
  aggregateAssigneeWorkload,
  aggregateBottleneckHoursByGroup,
  aggregateOriginUnitVolume,
  aggregateServiceVolume,
  rankBottleneckBars,
  rankNamedBars,
} from './aggregate-report-dashboard-charts';
import {
  aggregateReportDashboardKpis,
  previousReportWindow,
  reportDashboardKpisFromTotals,
  type ReportDashboardKpis,
} from './aggregate-report-dashboard-kpis';
import {
  aggregateReportVolumeSeries,
  buildReportVolumeSeries,
  type ReportDashboardVolumePoint,
} from './aggregate-report-volume-series';
import { loadReportsDashboardAggregates } from './sql-reports-dashboard-store';
import type {
  ReportDashboardAging,
  ReportDashboardNamedBar,
} from './aggregate-report-dashboard-charts';

export type ReportsDashboard = {
  readonly window: { readonly from: string; readonly to: string };
  readonly previousWindow: { readonly from: string; readonly to: string };
  readonly ticketCount: number;
  readonly kpis: ReportDashboardKpis;
  /**
   * Val 1 (M15/B1): postavka `private.dashboard.bottlenecks.enabled` mora
   * stvarno isključiti i **podatke** i prikaz, ne samo `GET /reports/bottlenecks`.
   * Zato odgovor nosi i zastavicu, da UI zna zašto je lista prazna.
   */
  readonly bottlenecksEnabled: boolean;
  readonly bottleneckByGroup: readonly ReportDashboardNamedBar[];
  readonly serviceVolume: readonly ReportDashboardNamedBar[];
  /** Val 1 (M15 gap): tiketi kreirani u prozoru, po organizacionoj jedinici. */
  readonly originUnitVolume: readonly ReportDashboardNamedBar[];
  /**
   * Val 1 (M15 gap): „opterećenje admina“ — otvoreni tiketi po izvršiocu
   * (stanje sada; tiketi bez izvršioca imaju vlastiti brojač).
   */
  readonly assigneeWorkload: readonly ReportDashboardNamedBar[];
  readonly volumeSeries: readonly ReportDashboardVolumePoint[];
  readonly aging: ReportDashboardAging;
};

export async function buildReportsDashboard(input: {
  readonly prisma: PrismaService;
  readonly configuration: ReportsConfiguration;
  readonly query: ReportScopeQuery;
  readonly now?: Date;
  readonly unroutedLabel?: string;
}): Promise<ReportsDashboard> {
  const now = input.now ?? new Date();
  const window = resolveReportWindow({
    from: input.query.from,
    to: input.query.to,
    now,
    defaultWindowDays: input.configuration.defaultWindowDays,
    mode: 'rolling',
  });
  const previousWindow = previousReportWindow(window);
  const scopedIds = await resolveReportOrganizationalUnitScope(
    input.prisma,
    input.query.organizationalUnitId,
  );
  const unroutedLabel = input.unroutedLabel ?? 'Unrouted';
  if (typeof input.prisma.$queryRaw === 'function') {
    const [aggregates, kbHelpedCount] = await Promise.all([
      loadReportsDashboardAggregates(input.prisma, scopedIds, window, previousWindow, now),
      countKnowledgeInterceptResolutions(input.prisma, scopedIds, window),
    ]);
    return {
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      previousWindow: {
        from: previousWindow.from.toISOString(),
        to: previousWindow.to.toISOString(),
      },
      ticketCount: aggregates.ticketCount,
      kpis: reportDashboardKpisFromTotals({
        ...aggregates.kpis,
        kbHelpedCount,
        csatScaleMax: input.configuration.csatScaleMax,
      }),
      bottlenecksEnabled: input.configuration.bottlenecksEnabled,
      bottleneckByGroup: input.configuration.bottlenecksEnabled
        ? rankBottleneckBars(aggregates.groups, unroutedLabel)
        : [],
      serviceVolume: rankNamedBars(
        aggregates.services.map((service) => ({
          key: service.key,
          label: service.name ?? service.key,
          value: service.count,
        })),
      ),
      originUnitVolume: rankNamedBars(
        aggregates.originUnits.map((unit) => ({
          key: unit.key,
          label: unit.name ?? unit.key,
          value: unit.count,
        })),
      ),
      assigneeWorkload: rankNamedBars(
        aggregates.assignees.map((assignee) => ({
          key: assignee.key,
          label: assignee.name ?? assignee.key,
          value: assignee.count,
        })),
      ),
      volumeSeries: buildReportVolumeSeries({
        window,
        createdByDay: aggregates.createdByDay,
        resolvedByDay: aggregates.resolvedByDay,
      }),
      aging: aggregates.aging,
    };
  }
  // Reference path (in-memory test clients without `$queryRaw`).
  const tickets = await loadScopedReportTickets(input.prisma, scopedIds, false);
  const [
    csatByTicketId,
    groupNames,
    serviceNames,
    unitNames,
    userNames,
    kbHelpedCount,
  ] = await Promise.all([
    loadTicketCsatSubmissions(
      input.prisma,
      tickets.map((ticket) => ticket.id),
    ),
    loadGroupNames(input.prisma, tickets.map((ticket) => ticket.assignedGroupId)),
    loadServiceNames(input.prisma, tickets.map((ticket) => ticket.serviceId)),
    loadOrganizationalUnitNames(
      input.prisma,
      tickets.map((ticket) => ticket.originUnitId),
    ),
    loadUserNames(input.prisma, tickets.map((ticket) => ticket.assignedUserId)),
    countKnowledgeInterceptResolutions(input.prisma, scopedIds, window),
  ]);
  return {
    window: {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    },
    previousWindow: {
      from: previousWindow.from.toISOString(),
      to: previousWindow.to.toISOString(),
    },
    ticketCount: tickets.length,
    kpis: aggregateReportDashboardKpis({
      tickets,
      csatByTicketId,
      window,
      previousWindow,
      kbHelpedCount,
      csatScaleMax: input.configuration.csatScaleMax,
    }),
    bottlenecksEnabled: input.configuration.bottlenecksEnabled,
    bottleneckByGroup: input.configuration.bottlenecksEnabled
      ? aggregateBottleneckHoursByGroup({
          tickets,
          window,
          groupNames,
          unroutedLabel,
        })
      : [],
    serviceVolume: aggregateServiceVolume({
      tickets,
      window,
      serviceNames,
    }),
    originUnitVolume: aggregateOriginUnitVolume({
      tickets,
      window,
      unitNames,
    }),
    assigneeWorkload: aggregateAssigneeWorkload({ tickets, userNames }),
    volumeSeries: aggregateReportVolumeSeries({ tickets, window }),
    aging: aggregateAgingBuckets({ tickets, now }),
  };
}

async function countKnowledgeInterceptResolutions(
  prisma: PrismaService,
  scopedOrganizationalUnitIds: readonly string[],
  window: { readonly from: Date; readonly to: Date },
): Promise<number> {
  if (typeof prisma.knowledgeInterceptResolution?.count !== 'function') {
    return 0;
  }
  return prisma.knowledgeInterceptResolution.count({
    where: {
      createdAt: { gte: window.from, lte: window.to },
      organizationalUnitId: { in: [...scopedOrganizationalUnitIds] },
    },
  });
}

async function loadGroupNames(
  prisma: PrismaService,
  groupIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  const uniqueIds = [
    ...new Set(groupIds.filter((id): id is string => id !== null && id.length > 0)),
  ];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const groups = (await prisma.group.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;
  return new Map(groups.map((group) => [group.id, group.name]));
}

async function loadOrganizationalUnitNames(
  prisma: PrismaService,
  unitIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  if (typeof prisma.organizationalUnit?.findMany !== 'function') {
    return new Map();
  }
  const uniqueIds = [
    ...new Set(unitIds.filter((id): id is string => id !== null && id.length > 0)),
  ];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const units = (await prisma.organizationalUnit.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  })) as Array<{ id: string; name?: string }>;
  return new Map(
    units
      .filter((unit) => typeof unit.name === 'string' && unit.name.length > 0)
      .map((unit) => [unit.id, unit.name as string]),
  );
}

async function loadUserNames(
  prisma: PrismaService,
  userIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  if (typeof prisma.user?.findMany !== 'function') {
    return new Map();
  }
  const uniqueIds = [
    ...new Set(userIds.filter((id): id is string => id !== null && id.length > 0)),
  ];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const users = (await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, displayName: true },
  })) as Array<{ id: string; displayName?: string }>;
  return new Map(
    users
      .filter(
        (user) => typeof user.displayName === 'string' && user.displayName.length > 0,
      )
      .map((user) => [user.id, user.displayName as string]),
  );
}

async function loadServiceNames(
  prisma: PrismaService,
  serviceIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const uniqueIds = [...new Set(serviceIds.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const services = (await prisma.service.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;
  return new Map(services.map((service) => [service.id, service.name]));
}
