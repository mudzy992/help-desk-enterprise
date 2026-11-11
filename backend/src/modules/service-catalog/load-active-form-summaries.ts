import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ServiceActiveFormSummary } from "./service-catalog.types";

type ActiveFormSummaryRecord = {
  readonly serviceId: string;
  readonly id: string;
  readonly version: number;
  readonly fieldCount: number;
};

type InMemoryActiveFormRecord = {
  readonly serviceId: string;
  readonly id: string;
  readonly version: number;
  readonly schema: { fields?: unknown } | null;
};

export async function loadActiveFormSummaries(
  prisma: PrismaService,
  serviceIds: readonly string[],
): Promise<ReadonlyMap<string, ServiceActiveFormSummary>> {
  if (serviceIds.length === 0) {
    return new Map();
  }
  const rows =
    typeof (prisma as { $queryRaw?: unknown }).$queryRaw === "function"
      ? await loadProjectedSummaries(prisma, serviceIds)
      : await loadInMemorySummaries(prisma, serviceIds);
  const summaries = new Map<string, ServiceActiveFormSummary>();
  for (const serviceId of serviceIds) {
    const row = rows.find((candidate) => candidate.serviceId === serviceId);
    summaries.set(serviceId, summarizeActiveForm(row ?? null));
  }
  return summaries;
}

async function loadProjectedSummaries(
  prisma: PrismaService,
  serviceIds: readonly string[],
): Promise<readonly ActiveFormSummaryRecord[]> {
  // The catalog needs only the active version identity and a field count. Select
  // at most one latest active row per service and let PostgreSQL project the
  // JSON array length; never transfer each form schema into the catalog list.
  return prisma.$queryRaw<ActiveFormSummaryRecord[]>(Prisma.sql`
    SELECT DISTINCT ON ("serviceId")
      "serviceId",
      "id",
      "version",
      CASE
        WHEN jsonb_typeof("schema" -> 'fields') = 'array'
          THEN jsonb_array_length("schema" -> 'fields')
        ELSE 0
      END::int AS "fieldCount"
    FROM "FormVersion"
    WHERE "serviceId" IN (${Prisma.join([...serviceIds])})
      AND "status" = 'ACTIVE'
    ORDER BY "serviceId" ASC, "version" DESC, "id" DESC
  `);
}

async function loadInMemorySummaries(
  prisma: PrismaService,
  serviceIds: readonly string[],
): Promise<readonly ActiveFormSummaryRecord[]> {
  // The in-memory Prisma test double does not implement raw SQL. Keep its
  // fallback equivalent to the production projection while limiting the
  // selected fields to the existing fixture schema shape.
  const rows = (await prisma.formVersion.findMany({
    where: {
      serviceId: { in: [...serviceIds] },
      status: "ACTIVE",
    },
    orderBy: [{ serviceId: "asc" }, { version: "desc" }, { id: "desc" }],
    select: {
      id: true,
      serviceId: true,
      version: true,
      schema: true,
    },
    take: serviceIds.length * 10,
  })) as readonly InMemoryActiveFormRecord[];
  const latestByService = new Map<string, ActiveFormSummaryRecord>();
  for (const row of rows) {
    if (!latestByService.has(row.serviceId)) {
      latestByService.set(row.serviceId, {
        id: row.id,
        serviceId: row.serviceId,
        version: row.version,
        fieldCount: Array.isArray(row.schema?.fields)
          ? row.schema.fields.length
          : 0,
      });
    }
  }
  return [...latestByService.values()];
}

function summarizeActiveForm(
  row: ActiveFormSummaryRecord | null,
): ServiceActiveFormSummary {
  if (row === null) {
    return { activeFormVersionRef: null, version: null, fieldCount: 0 };
  }
  return {
    activeFormVersionRef: row.id,
    version: row.version,
    fieldCount: row.fieldCount,
  };
}
