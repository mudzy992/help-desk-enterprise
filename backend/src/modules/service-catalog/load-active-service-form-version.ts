import { PrismaService } from "../../common/prisma/prisma.service";
import type { FormVersionRecord } from "./service-forms.types";

export type ActiveFormVersionRecord = FormVersionRecord & {
  readonly ticketCount: number;
};

export async function loadActiveServiceFormVersion(
  prisma: PrismaService,
  serviceId: string,
): Promise<ActiveFormVersionRecord | null> {
  const record = await prisma.formVersion.findFirst({
    where: { serviceId, status: "ACTIVE" },
    orderBy: [{ version: "desc" }, { id: "desc" }],
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
  });
  if (record === null) return null;
  return {
    id: record.id,
    serviceId: record.serviceId,
    version: record.version,
    schema: record.schema,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ticketCount: record._count.tickets,
  };
}
