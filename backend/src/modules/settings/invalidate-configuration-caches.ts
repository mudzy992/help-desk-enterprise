import {
  invalidateActorGroupsCache,
  invalidateOrganizationalUnitScopeCache,
} from '../../common/cache/scope-catalog-cache';
import { invalidateSharedSettingsSnapshot } from './settings-snapshot';

/**
 * Drops every short-lived configuration cache on this instance: the shared
 * `AppSetting` listing and the OU / group-membership catalogues.
 *
 * Called by writers that change configuration inside a transaction (install wizard,
 * config restore/rollback) — once inside (so the rest of the transaction's request
 * does not reuse a stale listing) and once after commit (so a request that raced the
 * commit cannot keep the pre-commit value for the TTL).
 */
export function invalidateConfigurationCaches(): void {
  invalidateSharedSettingsSnapshot();
  invalidateOrganizationalUnitScopeCache();
  invalidateActorGroupsCache();
}

/** `await afterCommit(prisma.$transaction(...))` — invalidates once the promise settles. */
export async function invalidateConfigurationCachesAfter<T>(
  work: Promise<T>,
): Promise<T> {
  try {
    return await work;
  } finally {
    invalidateConfigurationCaches();
  }
}
