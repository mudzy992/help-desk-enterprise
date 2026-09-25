import type { AuthorizationContext } from '../../authorization/authorization.types';

/**
 * Package 1.2: the actor must already have staff access to the ticket
 * (OU/service scope or D1 handler-group membership, checked by the caller via
 * `loadAccessibleTicket`), and hold the permission in one of their roles.
 * Scoping the permission to the ticket's OU as well would lock out the group
 * a ticket was forwarded to from another OU, which package 1.1 allows to work
 * the ticket fully.
 */
export function hasTicketPermission(
  context: AuthorizationContext,
  permissionKey: string,
): boolean {
  return (
    context.isSuperAdmin ||
    context.assignments.some((assignment) =>
      assignment.permissionKeys.includes(permissionKey),
    )
  );
}
