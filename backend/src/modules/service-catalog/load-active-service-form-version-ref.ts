import { PrismaService } from "../../common/prisma/prisma.service";

export async function loadActiveServiceFormVersionRef(
  prisma: PrismaService,
  serviceId: string,
): Promise<string | null> {
  const record = await prisma.formVersion.findFirst({
    where: { serviceId, status: "ACTIVE" },
    orderBy: [{ version: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return record?.id ?? null;
}
