import { PrismaService } from '../../common/prisma/prisma.service';
import { defaultRoutingConfiguration } from '../routing/routing.constants';
import { resolveTicketRouting } from '../routing/resolve-ticket-routing';
import { findInstallFallbackGroup } from './ensure-install-fallback-group';
import { findInstallOrganizationalUnit } from './ensure-install-organizational-unit';
import { findInstallRoutingRule } from './find-install-routing-rule';
import { toSeedService } from './find-install-seed-service-candidate';
import { installSeedConstants } from './install-seed.constants';
import type { InstallSeedPublicRecord } from './install-seed.types';
import { toInstallSeedPublicRecord } from './to-install-seed-public-record';

export async function readInstallSeedStatus(
  prisma: PrismaService,
): Promise<InstallSeedPublicRecord> {
  const organizationalUnit = await findInstallOrganizationalUnit(prisma);
  const fallbackGroup = await findInstallFallbackGroup(prisma);
  const serviceRecord =
    (await prisma.service.findUnique({
      where: { slug: installSeedConstants.serviceSlug },
    })) ??
    (await prisma.service.findMany({ where: { lifecycle: 'ACTIVE' } }))[0] ??
    null;
  const service = serviceRecord === null ? null : toSeedService(serviceRecord);
  const routingRule =
    organizationalUnit === null || service === null
      ? null
      : await findInstallRoutingRule(prisma, organizationalUnit.id, service.id);
  const resolution =
    organizationalUnit === null || service === null
      ? null
      : await resolveTicketRouting(
          prisma,
          {
            originUnitId: organizationalUnit.id,
            serviceId: service.id,
          },
          defaultRoutingConfiguration,
        ).catch(() => null);
  return toInstallSeedPublicRecord({
    organizationalUnit,
    fallbackGroup,
    service,
    routingRule,
    resolution,
  });
}
