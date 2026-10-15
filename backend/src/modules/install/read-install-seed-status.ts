import { PrismaService } from '../../common/prisma/prisma.service';
import { defaultRoutingConfiguration } from '../routing/routing.constants';
import { resolveTicketRouting } from '../routing/resolve-ticket-routing';
import { findInstallFallbackGroup } from './ensure-install-fallback-group';
import { findInstallOrganizationalUnit } from './ensure-install-organizational-unit';
import { findInstallRoutingRule } from './find-install-routing-rule';
import { toSeedService } from './find-install-seed-service-candidate';
import { defaultInstallSeedNames } from './install-seed.names';
import type { InstallSeedPublicRecord } from './install-seed.types';
import { toInstallSeedPublicRecord } from './to-install-seed-public-record';

export async function readInstallSeedStatus(
  prisma: PrismaService,
): Promise<InstallSeedPublicRecord> {
  const names = defaultInstallSeedNames;
  const organizationalUnit = await findInstallOrganizationalUnit(prisma, names);
  const fallbackGroup = await findInstallFallbackGroup(prisma, undefined, names);
  const serviceRecord =
    (await prisma.service.findUnique({
      where: { slug: names.serviceSlug },
    })) ??
    (await prisma.service.findMany({ where: { lifecycle: 'ACTIVE' } }))[0] ??
    null;
  const service =
    serviceRecord === null
      ? null
      : {
          ...toSeedService(serviceRecord),
          activeFormVersionRef: await findActiveFormVersionRef(
            prisma,
            serviceRecord.id,
          ),
          slaProfileKey: await findSlaProfileKey(prisma, serviceRecord.slaProfileId),
        };
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
    categoryName:
      serviceRecord === null
        ? null
        : await findCategoryName(prisma, serviceRecord.categoryId),
    organizationalUnit,
    fallbackGroup,
    service,
    routingRule,
    resolution,
  });
}

/** F2: the structure step shows (and re-sends) the stored category name. */
async function findCategoryName(
  prisma: PrismaService,
  categoryId: string,
): Promise<string | null> {
  const category = await prisma.serviceCategory.findUnique({
    where: { id: categoryId },
    select: { name: true },
  });
  return category?.name ?? null;
}

/** F2: the wizard shows which SLA profile the seeded service runs under. */
async function findSlaProfileKey(
  prisma: PrismaService,
  slaProfileId: string | null,
): Promise<string | null> {
  if (slaProfileId === null) {
    return null;
  }
  const profile = await prisma.slaProfile.findUnique({
    where: { id: slaProfileId },
    select: { key: true },
  });
  return profile?.key ?? null;
}

async function findActiveFormVersionRef(
  prisma: PrismaService,
  serviceId: string,
): Promise<string | null> {
  const active = await prisma.formVersion.findFirst({
    where: { serviceId, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  return active?.id ?? null;
}
