import { PrismaService } from "../../common/prisma/prisma.service";
import {
  serviceFormVersionsDefaultTake,
  serviceFormVersionsMaximumTake,
} from "./service-forms.constants";
import {
  decodeFormVersionListCursor,
  encodeFormVersionListCursor,
} from "./form-version-list-cursor";
import type {
  FormVersionRecord,
  ServiceFormListInput,
  ServiceFormListPage,
} from "./service-forms.types";

export async function loadLatestFormVersionNumber(
  prisma: PrismaService,
  serviceId: string,
): Promise<number> {
  const latest = await prisma.formVersion.findFirst({
    where: { serviceId },
    orderBy: [{ version: "desc" }, { id: "desc" }],
    select: { version: true },
  });
  return latest?.version ?? 0;
}

export async function listFormVersionRecords(
  prisma: PrismaService,
  serviceId: string,
  input: ServiceFormListInput = {},
): Promise<ServiceFormListPage> {
  const take = Math.min(
    serviceFormVersionsMaximumTake,
    Math.max(1, input.take ?? serviceFormVersionsDefaultTake),
  );
  const cursor = decodeFormVersionListCursor(input.cursor, serviceId);
  const where =
    cursor === null
      ? { serviceId }
      : {
          serviceId,
          OR: [
            { version: { lt: cursor.version } },
            { version: cursor.version, id: { lt: cursor.id } },
          ],
        };
  const [total, records] = await Promise.all([
    prisma.formVersion.count({ where: { serviceId } }),
    prisma.formVersion.findMany({
      where,
      orderBy: [{ version: "desc" }, { id: "desc" }],
      take: take + 1,
      select: {
        id: true,
        serviceId: true,
        version: true,
        schema: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { tickets: true } },
      },
    }),
  ]);
  const hasMore = records.length > take;
  const pageRecords = hasMore ? records.slice(0, take) : records;
  const mapped = pageRecords.map(
    (record) =>
      ({
        id: record.id,
        serviceId: record.serviceId,
        version: record.version,
        schema: record.schema,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ticketCount: record._count.tickets,
      }) satisfies FormVersionRecord & { readonly ticketCount: number },
  );
  const last = pageRecords.at(-1);
  return {
    records: mapped,
    total,
    take,
    cursor: input.cursor ?? null,
    nextCursor:
      hasMore && last !== undefined
        ? encodeFormVersionListCursor({
            serviceId,
            version: last.version,
            id: last.id,
          })
        : null,
    hasMore,
  };
}
