/**
 * Phase 1.3 (plan §1.3).
 *
 * The badge was read from the database on every poll; the answer only changes
 * when a notification is created or read, and both of those paths can tell the
 * cache about it. Fifteen seconds is short enough that a missed invalidation is
 * invisible, and long enough to absorb a poll wave.
 */
export const unreadCountCacheTtlSeconds = 15;

export const unreadCountCacheKeyPrefix = 'notifications:unread-count';
