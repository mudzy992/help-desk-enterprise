import { PrismaService } from '../../common/prisma/prisma.service';
import { createOrganizationalUnit } from '../organizational-units/create-organizational-unit';
import { installSeedConstants } from './install-seed.constants';
import { defaultInstallSeedNames, type InstallSeedNames } from './install-seed.names';

export type EnsuredInstallOrganizationalUnit = {
  readonly id: string;
  readonly name: string;
  readonly ouPath: string;
  readonly created: boolean;
};

export async function findInstallOrganizationalUnit(
  prisma: PrismaService,
  names: InstallSeedNames = defaultInstallSeedNames,
): Promise<{ id: string; name: string; ouPath: string } | null> {
  const canonical = await prisma.organizationalUnit.findUnique({
    where: { distinguishedName: names.distinguishedName },
    select: { id: true, name: true, ouPath: true },
  });
  if (canonical !== null) {
    return canonical;
  }
  const units = await prisma.organizationalUnit.findMany({
    orderBy: { ouPath: 'asc' },
    select: { id: true, name: true, ouPath: true },
  });
  return units[0] ?? null;
}

export async function ensureInstallOrganizationalUnit(
  prisma: PrismaService,
  names: InstallSeedNames = defaultInstallSeedNames,
): Promise<EnsuredInstallOrganizationalUnit> {
  const existing = await findInstallOrganizationalUnit(prisma, names);
  if (existing !== null) {
    // F2: a repeated seed never renames what is already there — the operator is
    // told through the response warning instead.
    return { ...existing, created: false };
  }
  const created = await createOrganizationalUnit(prisma, {
    name: names.organizationalUnitName,
    type: installSeedConstants.organizationalUnitType,
    distinguishedName: names.distinguishedName,
  });
  return {
    id: created.id,
    name: created.name,
    ouPath: created.ouPath,
    created: true,
  };
}
