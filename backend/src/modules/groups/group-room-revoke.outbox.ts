import type { JsonValue } from '../change-log/change-log.types';
import type { Prisma } from '../../generated/prisma/client';
import type { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';

/*
  W2.25 (`BA-groups-02`): the durable half of a membership revoke.

  Removing a member commits the row deletion and the actor's `authzVersion` bump in
  one transaction, which is what makes the *HTTP* next request correct on every
  instance. A Socket.IO room is not a database row, though: the removed member's
  browser is already subscribed to `group:<id>` on whichever API instance holds the
  connection, and that subscription is only dropped by a later sweep.

  So the revoke intent is written **in the same transaction** as the deletion and
  published afterwards to every instance over the existing socket invalidation
  channel. Two properties follow:

  * a process that crashes right after the commit cannot lose the intent - the row
    is committed with the membership change, and the dispatcher picks it up;
  * a Redis outage does not lose it either: the delivery fails, the outbox retries
    with backoff, and the 30-second room sweep stays as the documented safety net.

  Payload is tiny and carries no personal data beyond the two ids the room and the
  subject already are.
*/

/** Outbox topic for targeted group-room revokes. */
export const groupRoomRevokeTopic = 'groups.membership-revoke';

/** Delivery attempts before an intent is dead-lettered for an operator. */
export const groupRoomRevokeMaxAttempts = 20;

export type GroupRoomRevokeInput = {
  readonly subjectId: string;
  readonly groupId: string;
  /** The actor's `authzVersion` after the committed bump (audit/replay context). */
  readonly revision: number;
};

/**
 * One membership loss is one event. The revision makes a later re-add and a second
 * removal produce a new key instead of being deduplicated against the first.
 */
export function groupRoomRevokeDedupeKey(input: GroupRoomRevokeInput): string {
  return `groups.membership-revoke:${input.groupId}:${input.subjectId}:${input.revision}`.slice(0, 160);
}

export function toGroupRoomRevokePayload(input: GroupRoomRevokeInput): JsonValue {
  return {
    subjectId: input.subjectId,
    groupId: input.groupId,
    revision: input.revision,
  };
}

/** Strict read-back: a malformed payload dead-letters instead of revoking a guess. */
export function readGroupRoomRevokePayload(payload: JsonValue): GroupRoomRevokeInput {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('GROUP_ROOM_REVOKE_PAYLOAD_INVALID');
  }
  const candidate = payload as Record<string, JsonValue | undefined>;
  const subjectId = candidate.subjectId;
  const groupId = candidate.groupId;
  const revision = candidate.revision;
  if (typeof subjectId !== 'string' || subjectId.length === 0 || subjectId.length > 64) {
    throw new Error('GROUP_ROOM_REVOKE_PAYLOAD_INVALID');
  }
  if (typeof groupId !== 'string' || groupId.length === 0 || groupId.length > 64) {
    throw new Error('GROUP_ROOM_REVOKE_PAYLOAD_INVALID');
  }
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('GROUP_ROOM_REVOKE_PAYLOAD_INVALID');
  }
  return { subjectId, groupId, revision };
}

/**
 * Called inside the membership transaction. A writer that does not have the outbox
 * (a unit test, a script) simply records nothing here; the `authzVersion` fence and
 * the room sweep still apply, so correctness never depends on this row.
 */
export async function enqueueGroupRoomRevoke(
  outbox: Pick<TransactionalOutboxService, 'enqueue'> | undefined,
  transaction: Prisma.TransactionClient,
  input: GroupRoomRevokeInput,
): Promise<void> {
  if (outbox === undefined) return;
  await outbox.enqueue(transaction, {
    topic: groupRoomRevokeTopic,
    dedupeKey: groupRoomRevokeDedupeKey(input),
    payload: toGroupRoomRevokePayload(input),
    maxAttempts: groupRoomRevokeMaxAttempts,
  });
}
