import { PrismaService } from "../../common/prisma/prisma.service";
import type { DowntimeWindowRecord } from "./service-availability.types";

export async function loadServiceDowntimeOverlaps(
  prisma: PrismaService,
  serviceId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
): Promise<readonly DowntimeWindowRecord[]> {
  return prisma.serviceDowntimeWindow.findMany({
    where: {
      serviceId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 1,
    select: {
      id: true,
      serviceId: true,
      startsAt: true,
      endsAt: true,
      message: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
