import { ForbiddenException } from '@nestjs/common';

/**
 * Review 2026-09-25 (kritično): the users controller admits ADMIN as well as
 * SUPER_ADMIN, and reset-password returns the new temporary password in the
 * response. Without this check an ADMIN could reset a SUPER_ADMIN's password,
 * sign in as them and take over the installation (or delete/deactivate them).
 * Only a SUPER_ADMIN may manage another SUPER_ADMIN account.
 */
export function assertCanManageTargetUser(input: {
  readonly actorIsSuperAdmin: boolean;
  readonly targetIsSuperAdmin: boolean;
}): void {
  if (input.targetIsSuperAdmin && !input.actorIsSuperAdmin) {
    throw new ForbiddenException({
      code: 'SUPER_ADMIN_MANAGE_FORBIDDEN',
      message: 'Only a super admin may manage a super admin account',
    });
  }
}
