import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { evaluateServiceRuntimeAvailability } from '../service-catalog/evaluate-service-runtime-availability';
import { ServiceAvailabilityConfigurationLoader } from '../service-catalog/service-availability-configuration.loader';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { mapTicketError } from '../tickets/map-ticket-error';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { StatusPageConfigurationLoader, type StatusPageConfiguration } from './status-page.configuration';
import {
  openIncidentStatuses,
  statusPageLimits,
  uptimePercent,
  worstAvailability,
  type ServiceAvailabilityValue,
} from './status-page.model';

/** Who is reading: requesters never see STAFF_ONLY incidents or author names (§8.1). */
export type StatusViewerScope = {
  readonly global: boolean;
  readonly serviceIds: readonly string[];
  readonly organizationalUnitPaths: readonly string[];
};

export type StatusViewer = {
  readonly userId: string | null;
  readonly isStaff: boolean;
  readonly canManage: boolean;
  /** Undefined keeps internal/test callers backwards-compatible; request viewers always set it. */
  readonly staffScope?: StatusViewerScope | null;
};

export const anonymousViewer: StatusViewer = { userId: null, isStaff: false, canManage: false, staffScope: null };

export type IncidentUpdateView = {
  readonly id: string;
  readonly status: string;
  readonly message: string;
  readonly createdAt: string;
  readonly authorName: string | null;
};

export type IncidentView = {
  readonly id: string;
  readonly title: string;
  readonly titleEn: string | null;
  readonly impact: string;
  readonly status: string;
  readonly visibility: string;
  readonly startedAt: string;
  readonly resolvedAt: string | null;
  readonly services: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly updates: readonly IncidentUpdateView[];
  /** The embedded overview is deliberately bounded; use the timeline endpoint for older entries. */
  readonly updatesHasMore: boolean;
  readonly updatesNextCursor: string | null;
  /** Staff only (null for requesters and the public page). */
  readonly linkedTicketCount: number | null;
  readonly subscriberCount: number | null;
  readonly subscribed: boolean;
};

export type StatusServiceView = {
  readonly id: string;
  readonly name: string;
  readonly availability: ServiceAvailabilityValue;
  readonly incidentIds: readonly string[];
  readonly uptimePercent: number | null;
};

export type StatusPageView = {
  readonly generatedAt: string;
  readonly configuration: StatusPageConfiguration;
  readonly canManage: boolean;
  readonly affectedServiceCount: number;
  readonly categories: ReadonlyArray<{ readonly id: string | null; readonly name: string | null; readonly services: readonly StatusServiceView[] }>;
  readonly activeIncidents: readonly IncidentView[];
  readonly planned: ReadonlyArray<{ readonly serviceId: string; readonly serviceName: string; readonly startsAt: string; readonly endsAt: string; readonly message: string | null }>;
  readonly history: readonly IncidentView[];
};

type IncidentRecord = {
  id: string;
  title: string;
  titleEn: string | null;
  impact: string;
  status: string;
  visibility: string;
  startedAt: Date;
  resolvedAt: Date | null;
  services: Array<{ service: { id: string; name: string } }>;
  updates: Array<{ id: string; status: string; message: string; createdAt: Date; authorUserId: string | null }>;
  _count: { tickets: number; subscriptions: number };
  subscriptions: Array<{ userId: string }>;
};

/**
 * Paket 2.7 (§8.1-8.2): the read side. The service list shows the worst of
 * the manual availability, an active downtime window and open incidents;
 * the stored `Service.availability` is never rewritten by an incident.
 */
@Injectable()
export class StatusPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: StatusPageConfigurationLoader,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly availabilityConfigurationLoader: ServiceAvailabilityConfigurationLoader,
  ) {}

  loadConfiguration(): Promise<StatusPageConfiguration> {
    return this.configurationLoader.load();
  }

  async page(viewer: StatusViewer, now: Date = new Date()): Promise<StatusPageView> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.enabled && !viewer.canManage) {
      throw new NotFoundException({ code: 'STATUS_PAGE_DISABLED', message: 'The status page is disabled' });
    }
    const historyStart = new Date(now.getTime() - configuration.historyDays * 86_400_000);
    const [availabilityBundle, services, active, history, windows] = await Promise.all([
      this.availabilityConfigurationLoader.load(),
      this.prisma.service.findMany({
        where: { lifecycle: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          availability: true,
          category: { select: { id: true, name: true, sortOrder: true } },
        },
        orderBy: [{ name: 'asc' }],
      }),
      this.loadIncidents(withIncidentVisibility({ status: { in: [...openIncidentStatuses] } }, viewer), viewer, statusPageLimits.openIncidentsListed),
      this.loadIncidents(
        withIncidentVisibility({ status: 'RESOLVED', resolvedAt: { gte: historyStart } }, viewer),
        viewer,
        statusPageLimits.historyIncidentsListed,
      ),
      this.prisma.serviceDowntimeWindow.findMany({
        where: {
          endsAt: { gt: now },
          startsAt: { lt: new Date(now.getTime() + statusPageLimits.plannedWindowDays * 86_400_000) },
          service: { lifecycle: 'ACTIVE' },
        },
        select: {
          id: true,
          serviceId: true,
          startsAt: true,
          endsAt: true,
          message: true,
          createdAt: true,
          updatedAt: true,
          service: { select: { name: true } },
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    const uptimeSpans = configuration.showUptimePercent
      ? await this.prisma.serviceIncidentService.findMany({
          where: { incident: { impact: 'DOWN', startedAt: { lt: now }, OR: [{ resolvedAt: null }, { resolvedAt: { gt: historyStart } }] } },
          select: { serviceId: true, incident: { select: { impact: true, startedAt: true, resolvedAt: true } } },
        })
      : [];
    const spansByService = groupBy(uptimeSpans, (row) => row.serviceId, (row) => row.incident);
    const windowsByService = groupBy(windows, (row) => row.serviceId, (row) => row);
    const incidentsByService = new Map<string, IncidentView[]>();
    for (const incident of active) {
      for (const service of incident.services) {
        incidentsByService.set(service.id, [...(incidentsByService.get(service.id) ?? []), incident]);
      }
    }

    const categories = new Map<string, { id: string | null; name: string | null; sortOrder: number; services: StatusServiceView[] }>();
    let affected = 0;
    for (const service of services) {
      const effective = evaluateServiceRuntimeAvailability({
        storedAvailability: service.availability,
        downtimeWindows: (windowsByService.get(service.id) ?? []).map(({ service: _service, ...window }) => window),
        evaluation: { ...availabilityBundle, now },
      }).effectiveAvailability;
      const incidents = incidentsByService.get(service.id) ?? [];
      const availability = worstAvailability([effective, ...incidents.map((incident) => incident.impact as ServiceAvailabilityValue)]);
      if (availability !== 'OPERATIONAL') affected += 1;
      const key = service.category?.id ?? '';
      const bucket = categories.get(key) ?? {
        id: service.category?.id ?? null,
        name: service.category?.name ?? null,
        sortOrder: service.category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        services: [],
      };
      bucket.services.push({
        id: service.id,
        name: service.name,
        availability,
        incidentIds: incidents.map((incident) => incident.id),
        uptimePercent: configuration.showUptimePercent ? uptimePercent(spansByService.get(service.id) ?? [], historyStart, now) : null,
      });
      categories.set(key, bucket);
    }

    return {
      generatedAt: now.toISOString(),
      configuration,
      canManage: viewer.canManage,
      affectedServiceCount: affected,
      categories: [...categories.values()]
        .sort((left, right) => left.sortOrder - right.sortOrder || (left.name ?? '').localeCompare(right.name ?? ''))
        .map(({ id, name, services: list }) => ({ id, name, services: list })),
      activeIncidents: active,
      planned: windows
        .filter((window) => window.startsAt.getTime() > now.getTime())
        .map((window) => ({
          serviceId: window.serviceId,
          serviceName: window.service.name,
          startsAt: window.startsAt.toISOString(),
          endsAt: window.endsAt.toISOString(),
          message: window.message.length > 0 ? window.message : null,
        })),
      history,
    };
  }

  /** Open incidents on a service - the banner when opening a new ticket (§8.3). */
  async openForService(serviceId: string, viewer: StatusViewer): Promise<readonly IncidentView[]> {
    return this.loadIncidents(
      withIncidentVisibility(
        {
          status: { in: [...openIncidentStatuses] },
          services: { some: { serviceId } },
        },
        viewer,
      ),
      viewer,
      20,
    );
  }

  /**
   * Incidents linked to a ticket. Staff see all of them (panel); the
   * requester sees ALL_USERS incidents only ("known problem" banner).
   */
  async forTicket(ticketId: string, viewer: StatusViewer & { readonly userId: string }): Promise<{ readonly staff: boolean; readonly incidents: readonly IncidentView[] }> {
    let staff: boolean;
    try {
      const { access } = await loadAccessibleTicket(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        await this.accessPolicies.bind({ actorUserId: viewer.userId }),
      );
      staff = access.visibility === 'staff';
    } catch (error) {
      throw mapTicketError(error);
    }
    const effectiveViewer = statusViewerForTicket(viewer, staff);
    const incidents = await this.loadIncidents(
      withIncidentVisibility({ tickets: { some: { ticketId } } }, effectiveViewer),
      effectiveViewer,
      20,
    );
    return { staff, incidents };
  }

  async incident(id: string, viewer: StatusViewer): Promise<IncidentView> {
    const [found] = await this.loadIncidents(withIncidentVisibility({ id }, viewer), viewer, 1);
    if (found === undefined) throw new NotFoundException({ code: 'INCIDENT_NOT_FOUND', message: 'Incident not found' });
    return found;
  }

  async timeline(
    id: string,
    viewer: StatusViewer,
    input: { readonly cursor?: string; readonly take: number },
  ): Promise<{ readonly items: readonly IncidentUpdateView[]; readonly hasMore: boolean; readonly nextCursor: string | null }> {
    const visible = await this.prisma.serviceIncident.findFirst({
      where: withIncidentVisibility({ id }, viewer) as never,
      select: { id: true },
    });
    if (visible === null) throw new NotFoundException({ code: 'INCIDENT_NOT_FOUND', message: 'Incident not found' });
    const rows = await this.prisma.serviceIncidentUpdate.findMany({
      where: { incidentId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.take + 1,
      ...(input.cursor === undefined ? {} : { cursor: { id: input.cursor }, skip: 1 }),
      select: { id: true, status: true, message: true, createdAt: true, authorUserId: true },
    });
    const hasMore = rows.length > input.take;
    const page = hasMore ? rows.slice(0, input.take) : rows;
    const authorIds = viewer.isStaff
      ? [...new Set(page.map((update) => update.authorUserId).filter((authorId): authorId is string => authorId !== null))]
      : [];
    const authors = authorIds.length === 0
      ? new Map<string, string>()
      : new Map((await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, displayName: true } })).map((user) => [user.id, user.displayName]));
    return {
      items: page.map((update) => toIncidentUpdateView(update, viewer, authors)),
      hasMore,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  private async loadIncidents(where: Record<string, unknown>, viewer: StatusViewer, take: number): Promise<IncidentView[]> {
    const rows = (await this.prisma.serviceIncident.findMany({
      where: where as never,
      orderBy: [{ startedAt: 'desc' }],
      take,
      select: {
        id: true,
        title: true,
        titleEn: true,
        impact: true,
        status: true,
        visibility: true,
        startedAt: true,
        resolvedAt: true,
        services: { select: { service: { select: { id: true, name: true } } } },
        updates: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: statusPageLimits.timelineUpdatesEmbedded + 1,
          select: { id: true, status: true, message: true, createdAt: true, authorUserId: true },
        },
        _count: { select: { tickets: true, subscriptions: true } },
        subscriptions: { where: { userId: viewer.userId ?? '__none__' }, select: { userId: true } },
      },
    })) as unknown as IncidentRecord[];
    const authorIds = viewer.isStaff
      ? [...new Set(rows.flatMap((row) => row.updates.map((update) => update.authorUserId)).filter((id): id is string => id !== null))]
      : [];
    const authors =
      authorIds.length === 0
        ? new Map<string, string>()
        : new Map(
            (await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, displayName: true } })).map((user) => [
              user.id,
              user.displayName,
            ]),
          );
    return rows.map((row) => toIncidentView(row, viewer, authors));
  }
}

export function statusViewerForTicket(viewer: StatusViewer, hasStaffTicketAccess: boolean): StatusViewer {
  // Ticket access authorizes the ticket panel, not unrelated status resources.
  return { ...viewer, isStaff: hasStaffTicketAccess && viewer.isStaff };
}

export function withIncidentVisibility(where: Record<string, unknown>, viewer: StatusViewer): Record<string, unknown> {
  if (!viewer.isStaff) return { AND: [where, { visibility: 'ALL_USERS' }] };
  // Internal callers predating scoped viewers are explicitly global; HTTP viewers always carry a scope.
  if (viewer.staffScope === undefined || viewer.staffScope?.global === true) return where;
  const scope = viewer.staffScope;
  if (scope === null) return { AND: [where, { visibility: 'ALL_USERS' }] };
  // Status incidents are service resources and carry no organizational-unit dimension.
  // An OU-only assignment therefore cannot be projected onto them without broadening access.
  const serviceScope = scope.serviceIds.length === 0 ? [] : [{ id: { in: [...scope.serviceIds] } }];
  if (serviceScope.length === 0) return { AND: [where, { visibility: 'ALL_USERS' }] };
  return {
    AND: [
      where,
      {
        OR: [
          { visibility: 'ALL_USERS' },
          {
            visibility: 'STAFF_ONLY',
            services: { some: {}, every: { service: { OR: serviceScope } } },
          },
        ],
      },
    ],
  };
}

export function toIncidentView(row: IncidentRecord, viewer: StatusViewer, authors: ReadonlyMap<string, string>): IncidentView {
  return {
    id: row.id,
    title: row.title,
    titleEn: row.titleEn,
    impact: row.impact,
    status: row.status,
    visibility: row.visibility,
    startedAt: row.startedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    services: row.services.map((entry) => entry.service).sort((left, right) => left.name.localeCompare(right.name)),
    updates: row.updates.slice(0, statusPageLimits.timelineUpdatesEmbedded).map((update) => toIncidentUpdateView(update, viewer, authors)),
    updatesHasMore: row.updates.length > statusPageLimits.timelineUpdatesEmbedded,
    updatesNextCursor:
      row.updates.length > statusPageLimits.timelineUpdatesEmbedded
        ? (row.updates.at(statusPageLimits.timelineUpdatesEmbedded - 1)?.id ?? null)
        : null,
    linkedTicketCount: viewer.isStaff ? row._count.tickets : null,
    subscriberCount: viewer.isStaff ? row._count.subscriptions : null,
    subscribed: row.subscriptions.length > 0,
  };
}

function toIncidentUpdateView(
  update: { readonly id: string; readonly status: string; readonly message: string; readonly createdAt: Date; readonly authorUserId: string | null },
  viewer: StatusViewer,
  authors: ReadonlyMap<string, string>,
): IncidentUpdateView {
  return {
    id: update.id,
    status: update.status,
    message: update.message,
    createdAt: update.createdAt.toISOString(),
    authorName: viewer.isStaff && update.authorUserId !== null ? (authors.get(update.authorUserId) ?? null) : null,
  };
}

function groupBy<T, V>(rows: readonly T[], key: (row: T) => string, value: (row: T) => V): Map<string, V[]> {
  const map = new Map<string, V[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), value(row)]);
  return map;
}
