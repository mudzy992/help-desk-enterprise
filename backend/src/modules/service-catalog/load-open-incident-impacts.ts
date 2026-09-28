import { PrismaService } from '../../common/prisma/prisma.service';
import { openIncidentStatuses, worstAvailability, type IncidentImpact } from '../status-page/status-page.model';

/**
 * Paket 2.7 (§8.2): the worst impact of open incidents per service. The
 * catalog shows it on top of the manual availability without rewriting the
 * stored value. A failed read (or a test double without the delegate) means
 * "no incidents" - an incident must never break the catalog.
 */
export async function loadOpenIncidentImpacts(
  prisma: PrismaService,
  serviceIds: readonly string[],
): Promise<ReadonlyMap<string, IncidentImpact>> {
  const result = new Map<string, IncidentImpact>();
  const delegate = (prisma as { serviceIncidentService?: PrismaService['serviceIncidentService'] }).serviceIncidentService;
  if (serviceIds.length === 0 || delegate === undefined) return result;
  try {
    const rows = await delegate.findMany({
      where: { serviceId: { in: [...serviceIds] }, incident: { status: { in: [...openIncidentStatuses] } } },
      select: { serviceId: true, incident: { select: { impact: true } } },
    });
    for (const row of rows) {
      const worst = worstAvailability([result.get(row.serviceId), row.incident.impact as IncidentImpact]);
      if (worst !== 'OPERATIONAL') result.set(row.serviceId, worst);
    }
  } catch {
    return new Map();
  }
  return result;
}
