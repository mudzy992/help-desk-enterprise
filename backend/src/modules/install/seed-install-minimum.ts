import { PrismaService } from '../../common/prisma/prisma.service';
import { routingOutcomes } from '../routing/routing.constants';
import { resolveTicketRouting } from '../routing/resolve-ticket-routing';
import type { RoutingResolution } from '../routing/routing.types';
import { ensureInstallFallbackGroup } from './ensure-install-fallback-group';
import { ensureInstallOrganizationalUnit } from './ensure-install-organizational-unit';
import { ensureInstallSeedRouting } from './ensure-install-seed-routing';
import { ensureInstallSeedService } from './ensure-install-seed-service';
import { installSeedErrorCodes } from './install-seed.constants';
import { InstallSeedError } from './install-seed.error';
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
  return prisma.$transaction((transaction) =>
    seedInstallMinimumWithClient(transaction as PrismaService, context),
  );
}

async function seedInstallMinimumWithClient(
  prisma: PrismaService,
  context: InstallSeedContext,
): Promise<InstallSeedResult> {
  const organizationalUnit = await ensureInstallOrganizationalUnit(prisma);
  const existingFallbackHint = await findInstallRoutingRuleHint(
    prisma,
    organizationalUnit.id,
  );
  const fallbackGroup = await ensureInstallFallbackGroup(prisma, {
    organizationalUnitId: organizationalUnit.id,
    preferredGroupId: existingFallbackHint,
  });
  const seededService = await ensureInstallSeedService(
    prisma,
    organizationalUnit.id,
    fallbackGroup.id,
    context,
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
    routingRule: routingRule.created,
  };
  return {
    ...toInstallSeedPublicRecord({
      organizationalUnit,
      fallbackGroup,
      service: seededService.service,
      routingRule,
      resolution,
    }),
    created,
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
  fallbackGroupId: string,
): void {
  if (
    resolution.outcome !== routingOutcomes.exact ||
    resolution.groupId !== fallbackGroupId
  ) {
    throw new InstallSeedError(installSeedErrorCodes.routingUnresolved);
  }
}
