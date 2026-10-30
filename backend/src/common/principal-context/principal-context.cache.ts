import type { PrincipalContext } from './principal-context.types';

/**
 * Redis cache of the principal context (plan §2.2).
 *
 * Two keys per user:
 *
 * - `authz:{userId}:current` → the authz version the cached payload belongs to
 *   (TTL 60 s). It is the only key the invalidator touches;
 * - `authz:{userId}:v{version}` → the serialized principal context.
 *
 * The version indirection is what makes deactivation instant: a mutation bumps
 * `User.authzVersion` and moves the pointer to that new version. The payload for
 * the new version does not exist yet, so the very next request is a miss and
 * reads the database — no waiting for the TTL, and nothing has to be deleted
 * (the orphaned payload expires on its own).
 *
 * Two details keep the cache honest:
 *
 * - the pointer is only written with `NX`, so a fill that started before a
 *   mutation (and therefore carries the old version) can never move the pointer
 *   back over the mutation's tombstone;
 * - a pointer whose payload is missing is a miss, so a half-evicted entry
 *   degrades to a database read instead of an error.
 */
export const principalContextCacheTtlSeconds = 60;

export interface PrincipalContextCacheClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: 'EX',
    ttlSeconds: number,
    notExists?: 'NX',
  ): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export function principalContextVersionKey(userId: string): string {
  return `authz:${userId}:current`;
}

export function principalContextCacheKey(userId: string, version: number): string {
  return `authz:${userId}:v${version}`;
}

function isPrincipalContext(value: unknown): value is PrincipalContext {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<PrincipalContext>;
  return (
    typeof candidate.subjectId === 'string' &&
    typeof candidate.isActive === 'boolean' &&
    (candidate.directoryObjectGuid === null ||
      typeof candidate.directoryObjectGuid === 'string') &&
    typeof candidate.authzVersion === 'number' &&
    Array.isArray(candidate.assignments)
  );
}

/**
 * A miss, a broken client and a payload written by another version all end as
 * `null`: the caller then reads the database. Never throws (rule 2.2.5).
 */
export type PrincipalContextCacheMissReason =
  | 'no_client'
  | 'no_pointer'
  | 'invalid_pointer'
  | 'no_payload'
  | 'invalid_payload'
  | 'read_error';

export interface PrincipalContextCacheReadOptions {
  readonly localCandidate?: PrincipalContext | null;
  readonly onMiss?: (reason: PrincipalContextCacheMissReason) => void;
  readonly onLocalHit?: () => void;
}

export async function readCachedPrincipalContext(
  client: PrincipalContextCacheClient | null,
  userId: string,
  options: PrincipalContextCacheReadOptions = {},
): Promise<PrincipalContext | null> {
  const miss = (reason: PrincipalContextCacheMissReason): null => {
    try {
      options.onMiss?.(reason);
    } catch {
      // An optional diagnostic observer can never affect the cache read.
    }
    return null;
  };
  if (client === null) {
    return miss('no_client');
  }
  try {
    const version = await client.get(principalContextVersionKey(userId));
    if (version === null) {
      return miss('no_pointer');
    }
    const parsedVersion = Number.parseInt(version, 10);
    if (!Number.isInteger(parsedVersion)) {
      return miss('invalid_pointer');
    }
    const localCandidate = options.localCandidate;
    if (
      localCandidate !== undefined &&
      localCandidate !== null &&
      localCandidate.subjectId === userId &&
      localCandidate.authzVersion === parsedVersion
    ) {
      try {
        options.onLocalHit?.();
      } catch {
        // An optional diagnostic observer can never affect the cache read.
      }
      return localCandidate;
    }
    const payload = await client.get(principalContextCacheKey(userId, parsedVersion));
    if (payload === null) {
      return miss('no_payload');
    }
    let context: unknown;
    try {
      context = JSON.parse(payload);
    } catch {
      return miss('invalid_payload');
    }
    if (!isPrincipalContext(context) || context.authzVersion !== parsedVersion) {
      return miss('invalid_payload');
    }
    return context;
  } catch {
    return miss('read_error');
  }
}

export async function writeCachedPrincipalContext(
  client: PrincipalContextCacheClient | null,
  context: PrincipalContext,
  onWriteError?: () => void,
): Promise<void> {
  if (client === null) {
    return;
  }
  try {
    await client.set(
      principalContextCacheKey(context.subjectId, context.authzVersion),
      JSON.stringify(context),
      'EX',
      principalContextCacheTtlSeconds,
    );
    // NX: a fresher pointer (written by an invalidation while this fill was in
    // flight) always wins. The version only ever moves forward.
    await client.set(
      principalContextVersionKey(context.subjectId),
      String(context.authzVersion),
      'EX',
      principalContextCacheTtlSeconds,
      'NX',
    );
  } catch {
    try {
      onWriteError?.();
    } catch {
      // An optional diagnostic observer can never affect the cache write.
    }
    // The database stays the source of truth; a failed write only means the
    // next request reads it again.
  }
}

/**
 * Points the entry at a version that has no payload, so every later read misses
 * and reloads from the database. The old payload expires on its own — nothing
 * addresses it any more.
 *
 * `version` is the version the mutation just wrote to the database. Without it
 * (the bump failed, or the caller does not know the number) the pointer is
 * deleted instead, which is weaker but still a miss for the next request.
 */
export async function invalidateCachedPrincipalContext(
  client: PrincipalContextCacheClient | null,
  userId: string,
  version?: number | null,
): Promise<void> {
  if (client === null) {
    return;
  }
  try {
    if (typeof version === 'number' && Number.isInteger(version)) {
      await client.set(
        principalContextVersionKey(userId),
        String(version),
        'EX',
        principalContextCacheTtlSeconds,
      );
      return;
    }
    await client.del(principalContextVersionKey(userId));
  } catch {
    // Same as above: the entry expires within the TTL at the latest.
  }
}
