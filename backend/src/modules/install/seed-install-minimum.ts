import { invalidateConfigurationCachesAfter } from '../settings/invalidate-configuration-caches';
import { PrismaService } from '../../common/prisma/prisma.service';
import { seedDefaultRolePermissions } from '../rbac/seed-default-role-permissions';
import { routingOutcomes } from '../routing/routing.constants';
import { resolveTicketRouting } from '../routing/resolve-ticket-routing';
import type { RoutingResolution } from '../routing/routing.types';
import { ensureInstallFallbackGroup } from './ensure-install-fallback-group';
import { ensureInstallFallbackGroupMember } from './ensure-install-fallback-group-member';
import { ensureInstallOrganizationalUnit } from './ensure-install-organizational-unit';
import { ensureInstallSeedRouting } from './ensure-install-seed-routing';
import { ensureInstallSeedService } from './ensure-install-seed-service';
import { installSeedErrorCodes } from './install-seed.constants';
import { InstallSeedError } from './install-seed.error';
import { defaultInstallSeedNames } from './install-seed.names';
import { resolveInstallSeedSlaProfile } from './install-seed-sla-profile';
import { toInstallSeedStructureWarning } from './to-install-seed-structure-warning';
import type {
  InstallSeedContext,
  InstallSeedCreatedFlags,
  InstallSeedResult,
} from './install-seed.types';
import { toInstallSeedPublicRecord } from './to-install-seed-public-record';

export async function seedInstallMinimum(
  prisma: PrismaService,
  context: InstallSeedContext,
): Promise<InstallSeedResult> {
  const seeded = await invalidateConfigurationCachesAfter(prisma.$transaction((transaction) =>
    seedInstallMinimumWithClient(transaction as PrismaService, context),
  ));
  // Val 0 (finding M4/B1): the system roles and their default permission mapping
  // used to be created nowhere, so a fresh installation handed out 403s to
  // ADMIN/AGENT. Seeded right after the minimum data, before the wizard lets
  // anyone log in; additive and idempotent, so a repeated seed step is harmless.
  await seedDefaultRolePermissions(prisma);
  return seeded;
}

async function seedInstallMinimumWithClient(
  prisma: PrismaService,
  context: InstallSeedContext,
): Promise<InstallSeedResult> {
  const names = context.names ?? defaultInstallSeedNames;
  const organizationalUnit = await ensureInstallOrganizationalUnit(prisma, names);
  const existingFallbackHint = await findInstallRoutingRuleHint(
    prisma,
    organizationalUnit.id,
  );
  const fallbackGroup = await ensureInstallFallbackGroup(prisma, {
    organizationalUnitId: organizationalUnit.id,
    preferredGroupId: existingFallbackHint,
    names,
  });
  // F0.6: a fallback group without members means routed tickets reach nobody
  // (readiness `handlerGroup`). The founder joins it through the same domain
  // function the groups endpoint uses; repeated seeds do not duplicate it.
  await ensureInstallFallbackGroupMember(prisma, {
    groupId: fallbackGroup.id,
    userId: context.actorUserId,
  });
  // F2: the first ticket needs an SLA clock, so the service is created under the
  // standard profile when the deployment has one.
  const slaProfile = await resolveInstallSeedSlaProfile(prisma);
  const seededService = await ensureInstallSeedService(
    prisma,
    organizationalUnit.id,
    fallbackGroup.id,
    context,
    slaProfile,
  );
  const routingRule = await ensureInstallSeedRouting(prisma, {
    originUnitId: organizationalUnit.id,
    serviceId: seededService.service.id,
    groupId: fallbackGroup.id,
    actorUserId: context.actorUserId,
    routing: context.routing,
  });
  const resolution = await resolveTicketRouting(
    prisma,
    {
      originUnitId: organizationalUnit.id,
      serviceId: seededService.service.id,
    },
    context.routing,
  );
  assertSeedResolution(resolution, fallbackGroup.id);
  const created: InstallSeedCreatedFlags = {
    organizationalUnit: organizationalUnit.created,
    fallbackGroup: fallbackGroup.created,
    serviceCategory: seededService.categoryCreated,
    service: seededService.serviceCreated,
    serviceFormVersion: seededService.formVersionCreated,
    routingRule: routingRule.created,
  };
  // F2 (owner decision 5): a repeated seed never renames what exists; the
  // operator is told that the names they typed were not applied.
  const warning = toInstallSeedStructureWarning({
    requested: names,
    stored: {
      organizationalUnitName: organizationalUnit.name,
      handlerGroupName: fallbackGroup.name,
      categoryName: seededService.categoryName,
      serviceName: seededService.service.name,
    },
  });
  return {
    ...toInstallSeedPublicRecord({
      categoryName: seededService.categoryName,
      organizationalUnit,
      fallbackGroup,
      service: seededService.service,
      routingRule,
      resolution,
    }),
    created,
    ...(warning === null ? {} : { warning }),
  };
}

async function findInstallRoutingRuleHint(
  prisma: PrismaService,
  originUnitId: string,
): Promise<string | null> {
  const rules = await prisma.routingRule.findMany({
    where: { originUnitId },
  });
  return rules[0]?.groupId ?? null;
}

function assertSeedResolution(
  resolution: RoutingResolution,
  seedHandlerGroupId: string,
): void {
  if (
    resolution.outcome !== routingOutcomes.exact ||
    resolution.groupId !== seedHandlerGroupId
  ) {
    throw new InstallSeedError(installSeedErrorCodes.routingUnresolved);
  }
}
