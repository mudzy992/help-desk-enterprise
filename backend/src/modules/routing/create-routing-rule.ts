import { PrismaService } from '../../common/prisma/prisma.service';
import {
  assertRoutingTargetsExist,
  isDuplicateRoutingRuleConstraint,
} from './assert-routing-targets-exist';
import { RoutingError } from './routing.error';
import type { CreateRoutingRuleInput, RoutingRuleRecord } from './routing.types';

export async function createRoutingRule(
  prisma: PrismaService,
  input: CreateRoutingRuleInput,
): Promise<RoutingRuleRecord> {
  await assertRoutingTargetsExist(prisma, input);
  try {
    return await prisma.routingRule.create({
      data: {
        originUnitId: input.originUnitId,
        serviceId: input.serviceId,
        groupId: input.groupId,
      },
    });
  } catch (error) {
    if (isDuplicateRoutingRuleConstraint(error)) {
      throw new RoutingError('DUPLICATE_RULE');
    }
    throw error;
  }
}
