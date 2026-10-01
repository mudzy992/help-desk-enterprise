import type { Prisma } from '../../generated/prisma/client';
import { unitScopeWhere } from '../assets/asset-viewer';
import type { ChangeScope } from './change-access.service';

/**
 * §15: a change is visible inside the unit scope of the permission, to its
 * requester and owner, and to the members of its CAB group (who vote on it).
 * null = no restriction.
 */
export function changeVisibilityWhere(scope: ChangeScope, userId: string): Prisma.ChangeRequestWhereInput | null {
  const unitWhere = unitScopeWhere(scope);
  if (unitWhere === null) return null;
  return {
    OR: [
      { organizationalUnit: unitWhere as Prisma.OrganizationalUnitWhereInput },
      { requesterUserId: userId },
      { ownerUserId: userId },
      { cabGroup: { members: { some: { userId } } } },
    ],
  };
}
