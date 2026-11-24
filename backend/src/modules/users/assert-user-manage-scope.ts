import { ForbiddenException } from '@nestjs/common';
import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationService } from '../authorization/authorization.service';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';

/**
 * W2.10 (`BA-users-01`): the guard resolves the user in the URL to its
 * organizational unit, so it covers the *actor's* target. It cannot see a
 * second destination that the body carries:
 *
 *   - moving a user into another unit (`PATCH /users/:id` with
 *     `organizationalUnitId`),
 *   - granting or revoking a role whose scope is a unit or a service
 *     (`POST/DELETE /users/:id/roles`).
 *
 * Without this check a scoped ADMIN could pull a user out of a foreign unit,
 * push one into it, or hand out a service-scoped role it does not control
 * itself. The decision is the canonical `authorizeResource` every module uses,
 * so a SuperAdmin bypass, a global grant and a scoped grant are read the same
 * way as on the guarded route.
 *
 * Failure is a plain 403 with an opaque message: it never confirms whether the
 * destination unit, the service or the role assignment exists.
 */
export const userManageScopeForbiddenCode = 'USER_MANAGE_SCOPE_FORBIDDEN';

export type UserManageDestination = {
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
};

export async function assertActorManagesUserDestination(input: {
  readonly authorizationService: Pick<AuthorizationService, 'authorizeResource'>;
  readonly principal: AuthorizationPrincipal | null;
  readonly destination: UserManageDestination;
  readonly permissionKey?: string;
}): Promise<void> {
  const organizationalUnitId = input.destination.organizationalUnitId?.trim() || null;
  const serviceId = input.destination.serviceId?.trim() || null;
  // No destination is a global act - detaching a user from every unit, or
  // revoking a global role assignment. `authorizeResource` lets only a global
  // grant or a SuperAdmin do it, so no separate branch is needed here.
  const decision = await input.authorizationService.authorizeResource({
    principal: input.principal,
    permissionKey: input.permissionKey ?? permissionKeys.userManage,
    ownerUserId: null,
    organizationalUnitId,
    serviceId,
    allowOwner: false,
  });
  if (!decision.allowed) {
    throw new ForbiddenException({
      code: userManageScopeForbiddenCode,
      message: 'The user is outside the scope the role is assigned to',
    });
  }
}
