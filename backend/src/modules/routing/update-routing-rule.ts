import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertRoutingTargetsExist } from './assert-routing-targets-exist';
import { buildRoutingChangeSnapshot } from './build-routing-change-snapshot';
import { readRequiredRoutingReason } from './read-required-routing-reason';
import { resolveTicketRouting } from './resolve-ticket-routing';
import { RoutingError } from './routing.error';
import type {
  RoutingConfiguration,
  RoutingMutationContext,
  RoutingRuleRecord,
  UpdateRoutingRuleInput,
} from './routing.types';

export async function updateRoutingRule(
  prisma: PrismaService,
  ruleId: string,
  input: UpdateRoutingRuleInput,
  context: RoutingMutationContext,
  configuration: RoutingConfiguration,
): Promise<RoutingRuleRecord> {
  const reason = readRequiredRoutingReason(input.reason);
  return prisma.$transaction(async (transaction) => {
    const client = transaction as PrismaService;
    const existing = await client.routingRule.findUnique({
      where: { id: ruleId },
    });
    if (existing === null) {
      throw new RoutingError('RULE_NOT_FOUND');
    }
    await assertRoutingTargetsExist(client, {
      originUnitId: existing.originUnitId,
      serviceId: existing.serviceId,
      groupId: input.groupId,
    });
    const resolveInput = {
      originUnitId: existing.originUnitId,
      serviceId: existing.serviceId,
    };
    const beforeResolution = await resolveTicketRouting(
      client,
      resolveInput,
      configuration,
    );
    const updated = await client.routingRule.update({
      where: { id: ruleId },
      data: { groupId: input.groupId },
    });
    const afterResolution = await resolveTicketRouting(
      client,
      resolveInput,
      configuration,
    );
    const [before, after] = await Promise.all([
      buildRoutingChangeSnapshot(client, beforeResolution),
      buildRoutingChangeSnapshot(client, afterResolution),
    ]);
    await recordChangeLog(transaction as unknown as ChangeLogPrismaClient, {
      entityType: changeLogEntityTypes.routingRule,
      entityId: updated.id,
      reason,
      actorUserId: context.actorUserId,
      diff: buildChangeLogDiff({
        action: changeLogActions.update,
        resourceType: changeLogEntityTypes.routingRule,
        resourceId: updated.id,
        before,
        after,
      }),
    });
    return updated;
  });
}
