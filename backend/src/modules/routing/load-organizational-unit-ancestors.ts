import { PrismaService } from '../../common/prisma/prisma.service';
import { RoutingError } from './routing.error';
import type { OrganizationalUnitAncestor } from './routing.types';

export async function loadOrganizationalUnitAncestors(
  prisma: PrismaService,
  originUnitId: string,
): Promise<readonly OrganizationalUnitAncestor[]> {
  const units = await prisma.organizationalUnit.findMany({
    select: { id: true, parentId: true, ouPath: true },
  });
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  if (!byId.has(originUnitId)) {
    throw new RoutingError('ORIGIN_UNIT_NOT_FOUND');
  }
  return walkOrganizationalUnitAncestors(originUnitId, byId);
}

export function walkOrganizationalUnitAncestors(
  originUnitId: string,
  unitById: ReadonlyMap<string, OrganizationalUnitAncestor>,
): readonly OrganizationalUnitAncestor[] {
  const chain: OrganizationalUnitAncestor[] = [];
  const seen = new Set<string>();
  let current = unitById.get(originUnitId);
  while (current !== undefined) {
    if (seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    chain.push(current);
    if (current.parentId === null) {
      break;
    }
    current = unitById.get(current.parentId);
  }
  return chain;
}
