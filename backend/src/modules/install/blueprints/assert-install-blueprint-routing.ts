import type { PrismaService } from '../../../common/prisma/prisma.service';
import { routingOutcomes } from '../../routing/routing.constants';
import { resolveTicketRouting } from '../../routing/resolve-ticket-routing';
import type { RoutingConfiguration } from '../../routing/routing.types';
import { installBlueprintErrorCodes } from './install-blueprint.constants';
import { InstallBlueprintError } from './install-blueprint.error';

/**
 * F4.2 acceptance: „provjeren routing za svaki servis“. Same principle as
 * `assertSeedResolution` in the seed step — a service that resolves to a fallback
 * (or to nothing) would silently swallow tickets, so the apply refuses instead of
 * reporting a catalog that cannot receive them.
 */
export async function assertInstallBlueprintRouting(
  prisma: PrismaService,
  input: {
    readonly originUnitId: string;
    readonly serviceIds: readonly string[];
    readonly routing: RoutingConfiguration;
  },
): Promise<void> {
  for (const serviceId of input.serviceIds) {
    const resolution = await resolveTicketRouting(
      prisma,
      { originUnitId: input.originUnitId, serviceId },
      input.routing,
    );
    if (resolution.outcome !== routingOutcomes.exact) {
      throw new InstallBlueprintError(
        installBlueprintErrorCodes.routingUnresolved,
      );
    }
  }
}
