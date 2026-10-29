import type { Prisma } from "../../../generated/prisma/client";
import type { PrismaService } from "../../../common/prisma/prisma.service";
import { withTicketWhereClause } from "../../tickets/list/build-ticket-list-where";
import { dashboardVolumeWindows } from "./dashboard-volume-windows";
import type { DashboardVolumeDay } from "./report-summary.types";

/**
 * Exact, fixed-cost daily projection. Created and resolved use their own
 * timestamps, while every count reuses the ticket list's visibility scope.
 * The HTTP contract remains one summary request and the database workload is
 * bounded at 28 indexed counts regardless of ticket volume.
 */
export async function loadDashboardVolume(
  prisma: PrismaService,
  input: {
    readonly where: Prisma.TicketWhereInput;
    readonly now: Date;
    readonly timeZone: string;
  },
): Promise<readonly DashboardVolumeDay[]> {
  const windows = dashboardVolumeWindows(input.now, input.timeZone);
  const counts = await Promise.all(
    windows.flatMap((window) => [
      prisma.ticket.count({
        where: withTicketWhereClause(input.where, {
          createdAt: { gte: window.start, lt: window.end },
        }),
      }),
      prisma.ticket.count({
        where: withTicketWhereClause(input.where, {
          resolvedAt: { gte: window.start, lt: window.end },
        }),
      }),
    ]),
  );
  return windows.map((window, index) => ({
    date: window.key,
    created: counts[index * 2] ?? 0,
    resolved: counts[index * 2 + 1] ?? 0,
  }));
}
