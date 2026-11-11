import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ServiceCatalogError } from "./service-catalog.error";
import {
  serviceDowntimeWindowListDefaultTake,
  serviceDowntimeWindowListMaximumPeriodMs,
  serviceDowntimeWindowListMaximumResponseBytes,
  serviceDowntimeWindowListMaximumTake,
} from "./service-availability.constants";
import {
  decodeServiceDowntimeWindowListCursor,
  encodeServiceDowntimeWindowListCursor,
} from "./service-downtime-window-list-cursor";
import { loadService } from "./load-service";
import type {
  DowntimeWindowListInput,
  DowntimeWindowListPage,
} from "./service-availability.types";
import { toDowntimeWindowResponse } from "./to-downtime-window-response";

const defaultPeriodHalfWidthMs = serviceDowntimeWindowListMaximumPeriodMs / 2;

export async function listServiceDowntimeWindows(
  prisma: PrismaService,
  serviceId: string,
  now: Date,
  input: DowntimeWindowListInput = {},
): Promise<DowntimeWindowListPage> {
  await loadService(prisma, serviceId);
  const take = Math.min(
    serviceDowntimeWindowListMaximumTake,
    Math.max(1, input.take ?? serviceDowntimeWindowListDefaultTake),
  );
  const from = parseBoundary(
    input.from,
    new Date(now.getTime() - defaultPeriodHalfWidthMs),
  );
  const to = parseBoundary(
    input.to,
    new Date(now.getTime() + defaultPeriodHalfWidthMs),
  );
  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException("INVALID_SERVICE_DOWNTIME_PERIOD");
  }
  if (
    to.getTime() - from.getTime() >
    serviceDowntimeWindowListMaximumPeriodMs
  ) {
    throw new BadRequestException("SERVICE_DOWNTIME_PERIOD_EXCEEDS_LIMIT");
  }
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const cursor = decodeServiceDowntimeWindowListCursor(input.cursor, {
    serviceId,
    from: fromIso,
    to: toIso,
  });
  const periodWhere = {
    serviceId,
    startsAt: { lt: to },
    endsAt: { gt: from },
  };
  const where =
    cursor === null
      ? periodWhere
      : {
          ...periodWhere,
          OR: [
            { startsAt: { gt: new Date(cursor.startsAt) } },
            { startsAt: new Date(cursor.startsAt), id: { gt: cursor.id } },
          ],
        };
  const [total, records] = await Promise.all([
    prisma.serviceDowntimeWindow.count({ where: periodWhere }),
    prisma.serviceDowntimeWindow.findMany({
      where,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: take + 1,
    }),
  ]);
  const hasMore = records.length > take;
  const pageRecords = hasMore ? records.slice(0, take) : records;
  const items = pageRecords.map((record) =>
    toDowntimeWindowResponse(record, now),
  );
  const last = pageRecords.at(-1);
  const page: DowntimeWindowListPage = {
    items,
    total,
    take,
    cursor: input.cursor ?? null,
    nextCursor:
      hasMore && last !== undefined
        ? encodeServiceDowntimeWindowListCursor({
            serviceId,
            from: fromIso,
            to: toIso,
            startsAt: last.startsAt.toISOString(),
            id: last.id,
          })
        : null,
    hasMore,
    period: { from: fromIso, to: toIso },
  };
  if (
    Buffer.byteLength(JSON.stringify(page), "utf8") >
    serviceDowntimeWindowListMaximumResponseBytes
  ) {
    throw new ServiceCatalogError("CATALOG_RESOURCE_LIMIT_EXCEEDED");
  }
  return page;
}

function parseBoundary(value: string | undefined, fallback: Date): Date {
  if (value === undefined) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new BadRequestException("INVALID_SERVICE_DOWNTIME_PERIOD");
  return parsed;
}
