export type GroupsErrorCode =
  | 'NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'ORGANIZATIONAL_UNIT_NOT_FOUND'
  | 'INVALID_NAME'
  | 'DUPLICATE_KEY'
  | 'MEMBER_ALREADY_EXISTS'
  | 'MEMBER_NOT_FOUND'
  | 'HAS_DEPENDENCIES'
  | 'LAST_FALLBACK_GROUP'
  | 'FALLBACK_CONFLICT'
  | 'FORBIDDEN';

export class GroupsError extends Error {
  constructor(
    readonly code: GroupsErrorCode,
    message = code,
    /**
     * W2.12 (`BA-groups-01`): a refused delete carries the per-relation inventory
     * so the caller can act on it instead of guessing. Only `HAS_DEPENDENCIES`
     * fills this in.
     */
    readonly blockers: readonly { readonly kind: string; readonly count: number }[] = [],
    /**
     * W2.13 (`BA-groups-03`): a conflict may name the resource it is about (the
     * organizational unit whose fallback invariant was violated) so the UI and
     * the operator do not have to guess.
     */
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'GroupsError';
  }
}
