import { PrismaService } from '../../common/prisma/prisma.service';
import { createOrganizationalUnit } from '../organizational-units/create-organizational-unit';
import { installSeedConstants } from './install-seed.constants';

export type EnsuredInstallOrganizationalUnit = {
  readonly id: string;
  readonly name: string;
  readonly ouPath: string;
  readonly created: boolean;
};

export async function findInstallOrganizationalUnit(
  prisma: PrismaService,
): Promise<{ id: string; name: string; ouPath: string } | null> {
  const units = await prisma.organizationalUnit.findMany({
    orderBy: { ouPath: 'asc' },
  });
  const first = units[0];
  return first === undefined
    ? null
    : { id: first.id, name: first.name, ouPath: first.ouPath };
}

export async function ensureInstallOrganizationalUnit(
  prisma: PrismaService,
): Promise<EnsuredInstallOrganizationalUnit> {
  const existing = await findInstallOrganizationalUnit(prisma);
  if (existing !== null) {
    return { ...existing, created: false };
  }
  const created = await createOrganizationalUnit(prisma, {
    name: installSeedConstants.organizationalUnitName,
    type: installSeedConstants.organizationalUnitType,
    distinguishedName: installSeedConstants.distinguishedName,
  });
  return {
    id: created.id,
    name: created.name,
    ouPath: created.ouPath,
    created: true,
  };
}
