import { PrismaService } from '../../common/prisma/prisma.service';
import { RoutingError } from './routing.error';
import type { OrganizationalUnitAncestor } from './routing.types';

export const maximumRoutingAncestorDepth = 256;

export async function loadOrganizationalUnitAncestors(
  prisma: PrismaService,
  originUnitId: string,
): Promise<readonly OrganizationalUnitAncestor[]> {
  const chain: OrganizationalUnitAncestor[] = [];
  const seen = new Set<string>();
  let currentId: string | null = originUnitId;

  while (currentId !== null) {
    if (chain.length >= maximumRoutingAncestorDepth) {
      throw new RoutingError('UNAVAILABLE', 'ROUTING_ANCESTOR_DEPTH_EXCEEDED');
    }
    if (seen.has(currentId)) {
      break;
    }
    seen.add(currentId);
    const current: OrganizationalUnitAncestor | null =
      await prisma.organizationalUnit.findUnique({
        where: { id: currentId },
        select: { id: true, parentId: true, ouPath: true },
      });
    if (current === null) {
      if (chain.length === 0) {
        throw new RoutingError('ORIGIN_UNIT_NOT_FOUND');
      }
      break;
    }
    chain.push(current);
    currentId = current.parentId;
  }

  return chain;
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
