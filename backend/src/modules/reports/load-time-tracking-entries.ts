import { PrismaService } from '../../common/prisma/prisma.service';
import type { ReportPackFilters, ReportWindow, TimeTrackingReportEntry } from './reports.types';

/**
 * Package 1.3 (T9): finished, not deleted time entries that started inside the
 * window on tickets of the requested units. Running timers are left out — their
 * duration is not final yet. Two queries: entries (+ names), service names.
 */
export async function loadTimeTrackingEntries(
  prisma: PrismaService,
  input: {
    readonly organizationalUnitIds: readonly string[];
    readonly window: ReportWindow;
    /**
     * W7.53 (BA-reports-01): row budget from the caller (`rowLimit + 1` for the
     * probe row). Without it the pack would read every entry of the window.
     */
    readonly take?: number;
    /** W7.54 (BA-reports-02): service/group/priority slice, pushed into SQL. */
    readonly filters?: ReportPackFilters;
  },
): Promise<readonly TimeTrackingReportEntry[]> {
  if (input.organizationalUnitIds.length === 0) {
    return [];
  }
  const entries = await prisma.ticketTimeLog.findMany({
    where: {
      deletedAt: null,
      endedAt: { not: null },
      startedAt: { gte: input.window.from, lte: input.window.to },
      ticket: {
        originUnitId: { in: [...input.organizationalUnitIds] },
        ...(input.filters?.serviceId === undefined
          ? {}
          : { serviceId: input.filters.serviceId }),
        ...(input.filters?.groupId === undefined
          ? {}
          : { assignedGroupId: input.filters.groupId }),
        ...(input.filters?.priority === undefined
          ? {}
          : { priority: input.filters.priority }),
      },
    },
    select: {
      ticketId: true,
      userId: true,
      durationSeconds: true,
      source: true,
      stopReason: true,
      correctedAt: true,
      user: { select: { displayName: true } },
      ticket: { select: { serviceId: true } },
    },
    take: input.take,
  });
  const serviceIds = [...new Set(entries.map((entry) => entry.ticket.serviceId))];
  const services =
    serviceIds.length === 0
      ? []
      : await prisma.service.findMany({
          where: { id: { in: serviceIds } },
          select: { id: true, name: true },
        });
  const serviceNames = new Map(services.map((service) => [service.id, service.name]));
  return entries.map((entry) => ({
    ticketId: entry.ticketId,
    userId: entry.userId,
    userName: entry.user.displayName,
    serviceId: entry.ticket.serviceId,
    serviceName: serviceNames.get(entry.ticket.serviceId) ?? null,
    durationSeconds: entry.durationSeconds ?? 0,
    isManual: entry.source === 'MANUAL',
    stopReason: entry.stopReason,
    isCorrected: entry.correctedAt !== null,
  }));
}
