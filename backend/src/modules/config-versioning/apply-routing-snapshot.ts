import type { Prisma } from '../../generated/prisma/client';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type { ConfigSnapshot } from './config-versioning.types';

export async function applyRoutingSnapshot(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
): Promise<void> {
  await transaction.routingRule.deleteMany();
  if (snapshot.routing.rules.length === 0) {
    return;
  }
  try {
    await transaction.routingRule.createMany({
      data: snapshot.routing.rules.map((rule) => ({
        id: rule.id,
        originUnitId: rule.originUnitId,
        serviceId: rule.serviceId,
        groupId: rule.groupId,
      })),
    });
  } catch {
    throw new ConfigVersioningError(configVersioningErrorCodes.applyFailed);
  }
}
