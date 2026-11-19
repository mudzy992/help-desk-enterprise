import { PrismaService } from '../../common/prisma/prisma.service';
import type { ReportWindow, TimeTrackingReportEntry } from './reports.types';

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
      ticket: { originUnitId: { in: [...input.organizationalUnitIds] } },
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
    ...(input.take === undefined ? {} : { take: input.take }),
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
