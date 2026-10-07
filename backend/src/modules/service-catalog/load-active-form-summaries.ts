import { PrismaService } from '../../common/prisma/prisma.service';
import type { ServiceActiveFormSummary } from './service-catalog.types';

type ActiveFormSummaryRecord = {
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
  const rows = (await prisma.formVersion.findMany({
    where: {
      serviceId: { in: [...serviceIds] },
      status: 'ACTIVE',
    },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      serviceId: true,
      version: true,
      schema: true,
    },
  })) as readonly ActiveFormSummaryRecord[];
  const latestByService = new Map<string, ActiveFormSummaryRecord>();
  for (const row of rows) {
    if (!latestByService.has(row.serviceId)) {
      latestByService.set(row.serviceId, row);
    }
  }
  const summaries = new Map<string, ServiceActiveFormSummary>();
  for (const serviceId of serviceIds) {
    const row = latestByService.get(serviceId);
    summaries.set(serviceId, summarizeActiveForm(row ?? null));
  }
  return summaries;
}

function summarizeActiveForm(
  row: ActiveFormSummaryRecord | null,
): ServiceActiveFormSummary {
  if (row === null) {
    return { activeFormVersionRef: null, version: null, fieldCount: 0 };
  }
  const fields = Array.isArray(row.schema?.fields) ? row.schema.fields.length : 0;
  return {
    activeFormVersionRef: row.id,
    version: row.version,
    fieldCount: fields,
  };
}
