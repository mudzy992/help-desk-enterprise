import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildRoutingChangeSnapshot } from './build-routing-change-snapshot';
import { readRequiredRoutingReason } from './read-required-routing-reason';
import { resolveTicketRouting } from './resolve-ticket-routing';
import { RoutingError } from './routing.error';
import type {
  RoutingConfiguration,
  RoutingMutationContext,
  RoutingResolution,
} from './routing.types';

export type RoutingRuleDeleteImpact = {
  readonly ruleId: string;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly before: RoutingResolution;
  readonly after: RoutingResolution;
};

export async function computeRoutingRuleDeleteImpact(
  prisma: PrismaService,
  ruleId: string,
  configuration: RoutingConfiguration,
): Promise<RoutingRuleDeleteImpact> {
  const existing = await prisma.routingRule.findUnique({
    where: { id: ruleId },
  });
  if (existing === null) {
    throw new RoutingError('RULE_NOT_FOUND');
  }
  const resolveInput = {
    originUnitId: existing.originUnitId,
    serviceId: existing.serviceId,
  };
  const [before, after] = await Promise.all([
    resolveTicketRouting(prisma, resolveInput, configuration),
    resolveTicketRouting(
      prisma,
      { ...resolveInput, excludeRuleId: ruleId },
      configuration,
    ),
  ]);
  return {
    ruleId: existing.id,
    originUnitId: existing.originUnitId,
    serviceId: existing.serviceId,
    before,
    after,
  };
}

export async function deleteRoutingRule(
  prisma: PrismaService,
  ruleId: string,
  reasonInput: string,
  context: RoutingMutationContext,
  configuration: RoutingConfiguration,
): Promise<RoutingRuleDeleteImpact> {
  const reason = readRequiredRoutingReason(reasonInput);
  return prisma.$transaction(async (transaction) => {
    const client = transaction as PrismaService;
    const impact = await computeRoutingRuleDeleteImpact(
      client,
      ruleId,
      configuration,
    );
    await client.routingRule.delete({ where: { id: ruleId } });
    const [before, after] = await Promise.all([
      buildRoutingChangeSnapshot(client, impact.before),
      buildRoutingChangeSnapshot(client, impact.after),
    ]);
    await recordChangeLog(transaction as unknown as ChangeLogPrismaClient, {
      entityType: changeLogEntityTypes.routingRule,
      entityId: ruleId,
      reason,
      actorUserId: context.actorUserId,
      diff: buildChangeLogDiff({
        action: changeLogActions.delete,
        resourceType: changeLogEntityTypes.routingRule,
        resourceId: ruleId,
        before,
        after,
      }),
    });
    return impact;
  });
}
