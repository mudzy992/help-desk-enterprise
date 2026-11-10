import type { PrismaService } from '../../common/prisma/prisma.service';
import { openIncidentStatuses, worstAvailability, type IncidentImpact } from '../status-page/status-page.model';
import { ServiceCatalogError } from './service-catalog.error';

type IncidentImpactRow = Readonly<{
  serviceId: string;
  incident: { impact: IncidentImpact };
}>;

type IncidentReadDelegate = {
  findMany: (input: {
    where: {
      serviceId: { in: string[] };
      incident: { status: { in: readonly string[] }; visibility: 'ALL_USERS' };
    };
    select: { serviceId: true; incident: { select: { impact: true } } };
  }) => Promise<readonly IncidentImpactRow[]>;
};

/**
 * Paket 2.7 (§8.2): the worst impact of open incidents per service. The
 * catalog shows it on top of the manual availability without rewriting the
 * stored value. Only ALL_USERS incidents count: the catalog is shown to
 * requesters, and a STAFF_ONLY incident must not surface there. An unavailable
 * incident read is not evidence that there are no incidents, so the caller
 * must fail rather than return a possibly healthy service.
 */
export async function loadOpenIncidentImpacts(
  prisma: PrismaService,
  serviceIds: readonly string[],
): Promise<ReadonlyMap<string, IncidentImpact>> {
  const result = new Map<string, IncidentImpact>();
  if (serviceIds.length === 0) return result;

  const delegate = (prisma as unknown as { serviceIncidentService?: IncidentReadDelegate }).serviceIncidentService;
  if (delegate === undefined) {
    throw new ServiceCatalogError('INCIDENT_STATUS_UNAVAILABLE');
  }

  try {
    const rows = await delegate.findMany({
      where: {
        serviceId: { in: [...serviceIds] },
        incident: { status: { in: [...openIncidentStatuses] }, visibility: 'ALL_USERS' },
      },
      select: { serviceId: true, incident: { select: { impact: true } } },
    });
    for (const row of rows) {
      const worst = worstAvailability([result.get(row.serviceId), row.incident.impact as IncidentImpact]);
      if (worst !== 'OPERATIONAL') result.set(row.serviceId, worst);
    }
  } catch {
    throw new ServiceCatalogError('INCIDENT_STATUS_UNAVAILABLE');
  }
  return result;
}
