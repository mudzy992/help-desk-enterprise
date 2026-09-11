import { PrismaService } from '../../common/prisma/prisma.service';
import { RoutingError } from './routing.error';

export async function assertRoutingTargetsExist(
  prisma: PrismaService,
  input: {
    readonly originUnitId: string;
    readonly serviceId: string;
    readonly groupId: string;
  },
): Promise<void> {
  const [originUnit, service, group] = await Promise.all([
    prisma.organizationalUnit.findUnique({
      where: { id: input.originUnitId },
      select: { id: true },
    }),
    prisma.service.findUnique({
      where: { id: input.serviceId },
      select: { id: true },
    }),
    prisma.group.findUnique({
      where: { id: input.groupId },
      select: { id: true },
    }),
  ]);
  if (originUnit === null) {
    throw new RoutingError('ORIGIN_UNIT_NOT_FOUND');
  }
  if (service === null) {
    throw new RoutingError('SERVICE_NOT_FOUND');
  }
  if (group === null) {
    throw new RoutingError('GROUP_NOT_FOUND');
  }
}

export function isDuplicateRoutingRuleConstraint(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  if ((error as { code: unknown }).code !== 'P2002') {
    return false;
  }
  const target = (error as { meta?: { target?: readonly string[] } }).meta?.target;
  if (target === undefined) {
    return true;
  }
  return target.includes('originUnitId') && target.includes('serviceId');
}
