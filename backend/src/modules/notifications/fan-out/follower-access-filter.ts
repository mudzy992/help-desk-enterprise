/**
 * Paket 2.4 (C3): a follower is notified only while they can still see the
 * ticket (a forward to another unit, a confidential flag or a role change can
 * take the access away). The access check needs the tickets module's loaders,
 * which the notifications code must not import — the tickets module registers
 * the check here at start-up (same pattern as the broadcast e-mail channel).
 *
 * Without a registered check (unit tests, the worker) followers are dropped:
 * failing closed never leaks a ticket to someone who lost access.
 */
export type FollowerAccessFilter = (
  ticketId: string,
  userIds: readonly string[],
) => Promise<readonly string[]>;

let registered: FollowerAccessFilter | null = null;

export function registerFollowerAccessFilter(filter: FollowerAccessFilter): void {
  registered = filter;
}

export function clearFollowerAccessFilter(): void {
  registered = null;
}

export async function filterFollowersWithAccess(
  ticketId: string,
  userIds: readonly string[],
): Promise<readonly string[]> {
  if (userIds.length === 0 || registered === null) {
    return [];
  }
  return registered(ticketId, userIds);
}
