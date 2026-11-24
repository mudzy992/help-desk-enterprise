import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { evaluateResourcePolicy } from '../authorization/evaluate-resource-policy';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import { OrganizationalUnitError } from './organizational-unit.error';

/*
  W2.9 (`BA-organizational-units-01`): the guard covers the target in the URL or
  the parent in the body. Two operations have a second target that no route
  decorator can see:

    - mapping a user into a unit must also be covered for the unit the user is
      leaving (otherwise a scoped admin can pull a user out of a foreign OU),
    - moving a unit under a new parent must be covered for that destination
      (otherwise a scoped admin can push its subtree into a foreign branch).

  The decision itself is the canonical one every other module uses
  (`evaluateResourcePolicy`), so a SuperAdmin bypass, a global grant and a
  scoped grant are interpreted exactly the same way as on the guarded route.
  Failure is a plain `FORBIDDEN`, never a "not found" that would confirm the
  existence of a unit outside the scope.
*/
export async function assertActorManagesOrganizationalUnit(input: {
  readonly loader: Pick<AuthorizationContextLoader, 'loadBySubjectId'>;
  readonly prisma: Parameters<typeof loadOrganizationalUnitPath>[0];
  readonly actorUserId: string | null;
  readonly organizationalUnitId: string | null;
  /** `true` when a null unit means "unassign" and carries no scope of its own. */
  readonly allowNullTarget?: boolean;
}): Promise<void> {
  if (input.organizationalUnitId === null && input.allowNullTarget === true) {
    return;
  }
  const actorUserId = input.actorUserId?.trim() ?? '';
  if (actorUserId.length === 0) {
    throw new OrganizationalUnitError('FORBIDDEN');
  }
  // A loader that returns nothing is a wiring fault, not a wide grant.
  const context = await input.loader.loadBySubjectId(actorUserId);
  if (context === null || context === undefined) {
    throw new OrganizationalUnitError('FORBIDDEN');
  }
  const organizationalUnitPath =
    input.organizationalUnitId === null
      ? null
      : await loadOrganizationalUnitPath(input.prisma, input.organizationalUnitId);
  const decision = evaluateResourcePolicy({
    context,
    permissionKey: permissionKeys.organizationalUnitManage,
    allowOwner: false,
    target: {
      ownerUserId: null,
      organizationalUnitId: input.organizationalUnitId,
      organizationalUnitPath,
      serviceId: null,
    },
  });
  if (!decision.allowed) {
    throw new OrganizationalUnitError('FORBIDDEN');
  }
}
