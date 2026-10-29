import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildRoutingChangeSnapshot } from './build-routing-change-snapshot';
import { createRoutingRule } from './create-routing-rule';
import { readRequiredRoutingReason } from './read-required-routing-reason';
import { resolveTicketRouting } from './resolve-ticket-routing';
import type {
  CreateRoutingRuleInput,
  RoutingConfiguration,
  RoutingMutationContext,
  RoutingRuleRecord,
} from './routing.types';

export async function persistRoutingRuleChange(
  prisma: PrismaService,
  input: CreateRoutingRuleInput,
  context: RoutingMutationContext,
  configuration: RoutingConfiguration,
): Promise<RoutingRuleRecord> {
  const reason = readRequiredRoutingReason(input.reason);
  return prisma.$transaction(async (transaction) => {
    const client = transaction as PrismaService;
    const beforeResolution = await resolveTicketRouting(
      client,
      input,
      configuration,
    );
    const created = await createRoutingRule(client, input);
    const afterResolution = await resolveTicketRouting(
      client,
      input,
      configuration,
    );
    const [before, after] = await Promise.all([
      buildRoutingChangeSnapshot(client, beforeResolution),
      buildRoutingChangeSnapshot(client, afterResolution),
    ]);
    await recordChangeLog(transaction as unknown as ChangeLogPrismaClient, {
      entityType: changeLogEntityTypes.routingRule,
      entityId: created.id,
      reason,
      actorUserId: context.actorUserId,
      scopeOriginUnitId: created.originUnitId,
      scopeServiceId: created.serviceId,
      diff: buildChangeLogDiff({
        action: changeLogActions.create,
        resourceType: changeLogEntityTypes.routingRule,
        resourceId: created.id,
        before,
        after,
      }),
    });
    return created;
  });
}
