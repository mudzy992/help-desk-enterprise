import { PrismaService } from '../../common/prisma/prisma.service';
import { RoutingError } from './routing.error';
import type { OrganizationalUnitAncestor } from './routing.types';

export const maximumRoutingAncestorDepth = 256;
export const routingAncestorCycleMessage = 'ROUTING_ANCESTOR_CYCLE';
export const routingAncestorMissingParentMessage = 'ROUTING_ANCESTOR_MISSING_PARENT';

function ancestorIntegrityError(message: string): RoutingError {
  return new RoutingError('UNAVAILABLE', message);
}

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
      throw ancestorIntegrityError(routingAncestorCycleMessage);
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
      throw ancestorIntegrityError(routingAncestorMissingParentMessage);
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
  let currentId: string | null = originUnitId;

  while (currentId !== null) {
    if (chain.length >= maximumRoutingAncestorDepth) {
      throw new RoutingError('UNAVAILABLE', 'ROUTING_ANCESTOR_DEPTH_EXCEEDED');
    }
    if (seen.has(currentId)) {
      throw ancestorIntegrityError(routingAncestorCycleMessage);
    }
    seen.add(currentId);
    const current = unitById.get(currentId);
    if (current === undefined) {
      if (chain.length === 0) {
        throw new RoutingError('ORIGIN_UNIT_NOT_FOUND');
      }
      throw ancestorIntegrityError(routingAncestorMissingParentMessage);
    }
    chain.push(current);
    currentId = current.parentId;
  }

  return chain;
}
