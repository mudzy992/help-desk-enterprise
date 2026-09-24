/**
 * Phase 2.2 (plan §2.2).
 *
 * Everything the request path needs to know about the caller, loaded ONCE:
 *
 * - before: the session guard read the user (+ roles), then the authorization
 *   loader read the same user again (+ roles + permissions + OU + service), and
 *   every service that authorized itself read it a third time;
 * - after: one load fills this record, it is cached under
 *   `authz:{userId}:v{version}` (TTL 60 s) and everything else reads it.
 *
 * The assignments are the same shape the authorization context already used, so
 * the authorization decision itself is untouched — only the number of reads
 * changes. `authzVersion` is carried along because it is part of the cache key.
 */
export type PrincipalAssignment = {
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
};

/**
 * How a mutation (role, group, unit, policy pack) asks for the cached
 * authorization data of a user to be dropped (plan §2.2). The mutation
 * functions take it as an optional last parameter so they stay dependency-free
 * and testable without Redis.
 *
 * The hook never throws: the invalidation service swallows and logs every
 * failure, because a cache that could not be told about a write must not fail
 * the write itself (rule 2.2.5, fail-open).
 */
export type PrincipalInvalidationHook = (userId: string) => Promise<unknown>;

export type PrincipalContext = {
  readonly subjectId: string;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly isLocalOnly: boolean;
  readonly mustChangePassword: boolean;
  readonly entraObjectId: string | null;
  readonly roleKeys: readonly string[];
  readonly groupIds: readonly string[];
  readonly homeOrganizationalUnitId: string | null;
  readonly assignments: readonly PrincipalAssignment[];
  readonly authzVersion: number;
};
