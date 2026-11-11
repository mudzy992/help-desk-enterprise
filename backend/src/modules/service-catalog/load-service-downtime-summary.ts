import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { DowntimeWindowRecord } from "./service-availability.types";

type DowntimeSummary = {
  readonly windows: readonly DowntimeWindowRecord[];
  readonly upcomingCount: number;
};

export async function loadServiceDowntimeSummaries(
  prisma: PrismaService,
  serviceIds: readonly string[],
  now: Date,
): Promise<ReadonlyMap<string, DowntimeSummary>> {
  if (serviceIds.length === 0) return new Map();
  const uniqueServiceIds = [...new Set(serviceIds)];
  const [windows, upcomingCounts] = await Promise.all([
    typeof (prisma as { $queryRaw?: unknown }).$queryRaw === "function"
      ? loadProjectedWindows(prisma, uniqueServiceIds, now)
      : loadInMemoryWindows(prisma, uniqueServiceIds, now),
    loadUpcomingCounts(prisma, uniqueServiceIds, now),
  ]);
  const windowsByService = new Map<string, DowntimeWindowRecord[]>();
  for (const window of windows) {
    const group = windowsByService.get(window.serviceId) ?? [];
    group.push(window);
    windowsByService.set(window.serviceId, group);
  }
  const countByService = new Map(
    upcomingCounts.map((entry) => [entry.serviceId, entry.count]),
  );
  return new Map(
    uniqueServiceIds.map((serviceId) => [
      serviceId,
      {
        windows: windowsByService.get(serviceId) ?? [],
        upcomingCount: countByService.get(serviceId) ?? 0,
      },
    ]),
  );
}

export async function loadServiceDowntimeSummary(
  prisma: PrismaService,
  serviceId: string,
  now: Date,
): Promise<DowntimeSummary> {
  const summaries = await loadServiceDowntimeSummaries(
    prisma,
    [serviceId],
    now,
  );
  return summaries.get(serviceId) ?? { windows: [], upcomingCount: 0 };
}

async function loadProjectedWindows(
  prisma: PrismaService,
  serviceIds: readonly string[],
  now: Date,
): Promise<readonly DowntimeWindowRecord[]> {
  // The status/runtime summary is capped at one active and one nearest upcoming
  // window per service; upcoming counts are fetched separately as an aggregate.
  return prisma.$queryRaw<DowntimeWindowRecord[]>(Prisma.sql`
    SELECT "id", "serviceId", "startsAt", "endsAt", "message", "createdAt", "updatedAt"
    FROM (
      SELECT DISTINCT ON ("serviceId")
        "id", "serviceId", "startsAt", "endsAt", "message", "createdAt", "updatedAt"
      FROM "ServiceDowntimeWindow"
      WHERE "serviceId" IN (${Prisma.join([...serviceIds])})
        AND "startsAt" <= ${now}
        AND "endsAt" > ${now}
      ORDER BY "serviceId" ASC, "startsAt" DESC, "id" ASC
    ) AS active_windows
    UNION ALL
    SELECT "id", "serviceId", "startsAt", "endsAt", "message", "createdAt", "updatedAt"
    FROM (
      SELECT DISTINCT ON ("serviceId")
        "id", "serviceId", "startsAt", "endsAt", "message", "createdAt", "updatedAt"
      FROM "ServiceDowntimeWindow"
      WHERE "serviceId" IN (${Prisma.join([...serviceIds])})
        AND "startsAt" > ${now}
      ORDER BY "serviceId" ASC, "startsAt" ASC, "id" ASC
    ) AS upcoming_windows
  `);
}

async function loadInMemoryWindows(
  prisma: PrismaService,
  serviceIds: readonly string[],
  now: Date,
): Promise<readonly DowntimeWindowRecord[]> {
  const perService = await Promise.all(
    serviceIds.map(async (serviceId) => {
      const [active, upcoming] = await Promise.all([
        prisma.serviceDowntimeWindow.findMany({
          where: { serviceId, startsAt: { lte: now }, endsAt: { gt: now } },
          orderBy: [{ startsAt: "desc" }, { id: "asc" }],
          take: 1,
        }),
        prisma.serviceDowntimeWindow.findMany({
          where: { serviceId, startsAt: { gt: now } },
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          take: 1,
        }),
      ]);
      return [...active, ...upcoming] as readonly DowntimeWindowRecord[];
    }),
  );
  return perService.flat();
}

async function loadUpcomingCounts(
  prisma: PrismaService,
  serviceIds: readonly string[],
  now: Date,
): Promise<readonly { readonly serviceId: string; readonly count: number }[]> {
  const rows = await prisma.serviceDowntimeWindow.groupBy({
    by: ["serviceId"],
    where: { serviceId: { in: [...serviceIds] }, startsAt: { gt: now } },
    _count: { _all: true },
  });
  return rows.map((row) => ({
    serviceId: row.serviceId,
    count: row._count._all,
  }));
}
