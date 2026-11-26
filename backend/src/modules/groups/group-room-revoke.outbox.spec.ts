import type { JsonValue } from '../change-log/change-log.types';
import {
  enqueueGroupRoomRevoke,
  groupRoomRevokeDedupeKey,
  groupRoomRevokeMaxAttempts,
  groupRoomRevokeTopic,
  readGroupRoomRevokePayload,
  toGroupRoomRevokePayload,
} from './group-room-revoke.outbox';

/*
  W2.25 (`BA-groups-02`): the durable half of "remove a member, lose the room".
  These tests pin the contract the dispatcher and the subscriber rely on: one
  membership loss is one event with a stable key, the payload is strict enough that
  a corrupted row dead-letters instead of revoking a guess, and the intent is
  written on the caller's transaction (so it commits or disappears with the
  deletion that produced it).
*/
describe('group room revoke outbox', () => {
  const input = { subjectId: 'user-1', groupId: 'group-1', revision: 5 };

  it('names one event per membership loss, not per attempt', () => {
    const key = groupRoomRevokeDedupeKey(input);
    expect(key).toBe('groups.membership-revoke:group-1:user-1:5');
    expect(groupRoomRevokeDedupeKey(input)).toBe(key);
    // A later re-add and a second removal is a different event.
    expect(groupRoomRevokeDedupeKey({ ...input, revision: 6 })).not.toBe(key);
    expect(groupRoomRevokeDedupeKey(input).length).toBeLessThanOrEqual(160);
  });

  it('round-trips the payload and rejects anything malformed', () => {
    expect(readGroupRoomRevokePayload(toGroupRoomRevokePayload(input))).toEqual(input);
    expect(() => readGroupRoomRevokePayload(null as unknown as JsonValue)).toThrow(
      'GROUP_ROOM_REVOKE_PAYLOAD_INVALID',
    );
    expect(() => readGroupRoomRevokePayload([] as unknown as JsonValue)).toThrow(
      'GROUP_ROOM_REVOKE_PAYLOAD_INVALID',
    );
    expect(() => readGroupRoomRevokePayload({ groupId: 'g', revision: 1 } as JsonValue)).toThrow(
      'GROUP_ROOM_REVOKE_PAYLOAD_INVALID',
    );
    expect(() => readGroupRoomRevokePayload({ ...input, revision: '5' } as unknown as JsonValue)).toThrow(
      'GROUP_ROOM_REVOKE_PAYLOAD_INVALID',
    );
    expect(() => readGroupRoomRevokePayload({ ...input, revision: -1 } as JsonValue)).toThrow(
      'GROUP_ROOM_REVOKE_PAYLOAD_INVALID',
    );
    expect(() => readGroupRoomRevokePayload({ ...input, subjectId: '' } as JsonValue)).toThrow(
      'GROUP_ROOM_REVOKE_PAYLOAD_INVALID',
    );
  });

  it('writes the intent on the caller transaction with the shared retry budget', async () => {
    const enqueue = jest.fn(async () => ({ id: 'outbox-1', created: true }));
    const transaction = { outboxMessage: { findUniqueOrThrow: jest.fn() } };

    await enqueueGroupRoomRevoke({ enqueue } as never, transaction as never, input);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(transaction, {
      topic: groupRoomRevokeTopic,
      dedupeKey: 'groups.membership-revoke:group-1:user-1:5',
      payload: toGroupRoomRevokePayload(input),
      maxAttempts: groupRoomRevokeMaxAttempts,
    });
  });

  it('records nothing when the writer has no outbox (unit test, script)', async () => {
    const transaction = { outboxMessage: { findUniqueOrThrow: jest.fn() } };
    await expect(
      enqueueGroupRoomRevoke(undefined, transaction as never, input),
    ).resolves.toBeUndefined();
  });
});
