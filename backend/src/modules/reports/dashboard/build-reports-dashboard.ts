import { PrismaService } from '../../../common/prisma/prisma.service';
import { loadTicketCsatSubmissions } from '../../tickets/csat/load-ticket-csat-submissions';
import { loadScopedReportTickets } from '../load-scoped-report-tickets';
import { resolveReportOrganizationalUnitScope } from '../resolve-report-organizational-unit-scope';
import { resolveReportWindow } from '../resolve-report-window';
import type { ReportScopeQuery, ReportsConfiguration } from '../reports.types';
import {
  aggregateAgingBuckets,
  aggregateBottleneckHoursByGroup,
  aggregateServiceVolume,
} from './aggregate-report-dashboard-charts';
import {
  aggregateReportDashboardKpis,
  previousReportWindow,
  type ReportDashboardKpis,
} from './aggregate-report-dashboard-kpis';
import {
  aggregateReportVolumeSeries,
  type ReportDashboardVolumePoint,
} from './aggregate-report-volume-series';
import type {
  ReportDashboardAging,
  ReportDashboardNamedBar,
} from './aggregate-report-dashboard-charts';

export type ReportsDashboard = {
  readonly window: { readonly from: string; readonly to: string };
  readonly previousWindow: { readonly from: string; readonly to: string };
  readonly ticketCount: number;
  readonly kpis: ReportDashboardKpis;
  readonly bottleneckByGroup: readonly ReportDashboardNamedBar[];
  readonly serviceVolume: readonly ReportDashboardNamedBar[];
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
  const tickets = await loadScopedReportTickets(input.prisma, scopedIds, false);
  const [csatByTicketId, groupNames, serviceNames, kbHelpedCount] =
    await Promise.all([
      loadTicketCsatSubmissions(
        input.prisma,
        tickets.map((ticket) => ticket.id),
      ),
      loadGroupNames(input.prisma, tickets.map((ticket) => ticket.assignedGroupId)),
      loadServiceNames(input.prisma, tickets.map((ticket) => ticket.serviceId)),
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
    }),
    bottleneckByGroup: aggregateBottleneckHoursByGroup({
      tickets,
      window,
      groupNames,
      unroutedLabel: input.unroutedLabel ?? 'Unrouted',
    }),
    serviceVolume: aggregateServiceVolume({
      tickets,
      window,
      serviceNames,
    }),
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
