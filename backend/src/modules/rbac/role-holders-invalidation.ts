/**
 * W2.32 (`BA-rbac-05`): the namespace of the durable "drop the cached principal
 * context of every holder of this role" intent.
 *
 * The message is scheduled inside the role write's transaction and delivered by
 * `RoleHoldersInvalidationDispatcher`, so an unreachable Redis delays the
 * tombstone instead of losing it. The database fence (`User.authzVersion`) is
 * what actually stops the stale grant; this message is what stops the situation
 * from degrading into a full database read per holder for a whole TTL.
 */
export const roleHoldersInvalidationNamespace = 'authz.role-holders';
