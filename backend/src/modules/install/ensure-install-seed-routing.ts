import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildRoutingChangeSnapshot } from '../routing/build-routing-change-snapshot';
import { createRoutingRule } from '../routing/create-routing-rule';
import { resolveTicketRouting } from '../routing/resolve-ticket-routing';
import type { RoutingConfiguration } from '../routing/routing.types';
import { installSeedConstants } from './install-seed.constants';
import { findInstallRoutingRule } from './find-install-routing-rule';
import type { InstallSeedRoutingRule } from './install-seed.types';

export type EnsuredInstallSeedRouting = InstallSeedRoutingRule & {
  readonly created: boolean;
};

export async function ensureInstallSeedRouting(
  prisma: PrismaService,
  input: {
    readonly originUnitId: string;
    readonly serviceId: string;
    readonly groupId: string;
    readonly actorUserId: string;
    readonly routing: RoutingConfiguration;
  },
): Promise<EnsuredInstallSeedRouting> {
  const existing = await findInstallRoutingRule(
    prisma,
    input.originUnitId,
    input.serviceId,
  );
  if (existing !== null) {
    return { ...existing, created: false };
  }
  const beforeResolution = await resolveTicketRouting(
    prisma,
    input,
    input.routing,
  );
  const created = await createRoutingRule(prisma, {
    originUnitId: input.originUnitId,
    serviceId: input.serviceId,
    groupId: input.groupId,
    reason: installSeedConstants.changeLogReason,
  });
  const afterResolution = await resolveTicketRouting(
    prisma,
    input,
    input.routing,
  );
  const [before, after] = await Promise.all([
    buildRoutingChangeSnapshot(prisma, beforeResolution),
    buildRoutingChangeSnapshot(prisma, afterResolution),
  ]);
  await recordChangeLog(prisma as unknown as ChangeLogPrismaClient, {
    entityType: changeLogEntityTypes.routingRule,
    entityId: created.id,
    reason: installSeedConstants.changeLogReason,
    actorUserId: input.actorUserId,
    diff: buildChangeLogDiff({
      action: changeLogActions.create,
      resourceType: changeLogEntityTypes.routingRule,
      resourceId: created.id,
      before,
      after,
    }),
  });
  return {
    id: created.id,
    originUnitId: created.originUnitId,
    serviceId: created.serviceId,
    groupId: created.groupId,
    created: true,
  };
}
