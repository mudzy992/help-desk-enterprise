import { PrismaService } from '../../common/prisma/prisma.service';

export async function findInstallRoutingRule(
  prisma: PrismaService,
  originUnitId: string,
  serviceId: string,
): Promise<{
  id: string;
  originUnitId: string;
  serviceId: string;
  groupId: string;
} | null> {
  const rules = await prisma.routingRule.findMany({
    where: { originUnitId, serviceId },
  });
  return rules[0] ?? null;
}
