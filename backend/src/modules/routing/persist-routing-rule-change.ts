import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
  changeLogErrorCodes,
} from '../change-log/change-log.constants';
import { ChangeLogError } from '../change-log/change-log.error';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { requireChangeReason } from '../change-log/require-change-reason';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildRoutingChangeSnapshot } from './build-routing-change-snapshot';
import { createRoutingRule } from './create-routing-rule';
import { resolveTicketRouting } from './resolve-ticket-routing';
import { RoutingError } from './routing.error';
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
  const reason = readRequiredReason(input.reason);
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

function readRequiredReason(reason: string): string {
  try {
    return requireChangeReason(reason);
  } catch (error) {
    if (
      error instanceof ChangeLogError &&
      error.code === changeLogErrorCodes.reasonRequired
    ) {
      throw new RoutingError('REASON_REQUIRED');
    }
    throw error;
  }
}
