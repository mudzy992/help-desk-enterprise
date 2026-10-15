import type { PrismaService } from '../../../common/prisma/prisma.service';
import { settingKeys } from '../../settings/setting-keys';
import type { InstallSettingsSectionFieldOption } from './install-settings-section.types';

/**
 * Install wizard v2 (F5): a few keys do not hold a free text but the id of an
 * entity this deployment has (the service an inbound e-mail opens a ticket in).
 * A generic text input would ask the operator to paste a cuid, so those keys get
 * a list of options instead — the same records the Settings screen would offer,
 * with no second source of truth.
 */
export async function readInstallSectionFieldOptions(
  prisma: PrismaService,
  key: string,
): Promise<readonly InstallSettingsSectionFieldOption[] | undefined> {
  if (key === settingKeys.privateInboundDefaultServiceId) {
    return listServiceOptions(prisma);
  }
  return undefined;
}

async function listServiceOptions(
  prisma: PrismaService,
): Promise<readonly InstallSettingsSectionFieldOption[]> {
  const services = await prisma.service.findMany({
    where: { lifecycle: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
  return services.map((service) => ({
    value: service.id,
    label: service.name,
  }));
}
