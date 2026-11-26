import {
  parseSocketSessionInvalidation,
  socketSessionInvalidationChannel,
} from '../../common/security/socket-session-invalidation';
import { toGroupRoomRevokePayload } from '../groups/group-room-revoke.outbox';
import { GroupRoomRevokeDispatcher } from './group-room-revoke.dispatcher';

/*
  W2.25 (`BA-groups-02`): the dispatcher is the only place a committed revoke
  intent becomes a cross-instance socket event. What it must prove:

    * a published event is exactly the `group` kind with the subject and the room;
    * a Redis failure is a **retry**, never a silent success — the revoke is durable,
      so losing the publish would lose the whole point of the outbox;
    * a dead letter is announced (the 30 s sweep is the net, but an operator has to
      see that the fast path gave up);
    * a deployment without Redis publishes nothing and does not spin on retries.
*/
type Delivery = { readonly id: string; readonly payload: Record<string, unknown> };

function harness(options: { redisPresent?: boolean } = {}) {
  const deliveries: Delivery[] = [];
  const results: ('idle' | 'succeeded' | 'retry' | 'dead-letter')[] = [];
  const handler = jest.fn();
  const outbox = {
    dispatchOne: jest.fn(async (_topic: string, run: (delivery: Delivery) => Promise<void>) => {
      handler();
      const next = results.shift() ?? 'idle';
      if (next === 'idle') return 'idle';
      const delivery = deliveries.shift();
      if (delivery === undefined) return 'idle';
      if (next === 'succeeded') {
        await run(delivery);
        return 'succeeded';
      }
      try {
        await run(delivery);
        return next;
      } catch {
        return next;
      }
    }),
  };
  const publish = jest.fn(async () => 1);
  const redis = options.redisPresent === false ? undefined : { status: 'ready', publish };
  const dispatcher = new GroupRoomRevokeDispatcher(outbox as never, redis as never);
  return { dispatcher, outbox, publish, results, deliveries, handler };
}

const event = toGroupRoomRevokePayload({ subjectId: 'user-1', groupId: 'group-1', revision: 5 });

describe('GroupRoomRevokeDispatcher', () => {
  it('publishes the committed revoke as a group event on the shared channel', async () => {
    const { dispatcher, publish, results, deliveries } = harness();
    results.push('succeeded');
    deliveries.push({ id: 'outbox-1', payload: event as unknown as Record<string, unknown> });

    await expect(dispatcher.drain(5)).resolves.toBe(1);

    expect(publish).toHaveBeenCalledTimes(1);
    const [channel, message] = publish.mock.calls[0] as unknown as [string, string];
    expect(channel).toBe(socketSessionInvalidationChannel);
    expect(parseSocketSessionInvalidation(message)).toEqual({
      version: 1,
      kind: 'group',
      subjectId: 'user-1',
      groupId: 'group-1',
    });
  });

  it('leaves the revoke retryable when Redis refuses the publish', async () => {
    const { dispatcher, publish, results, deliveries } = harness();
    publish.mockRejectedValueOnce(new Error('redis down'));
    results.push('retry');
    deliveries.push({ id: 'outbox-1', payload: event as unknown as Record<string, unknown> });

    await expect(dispatcher.drain(5)).resolves.toBe(0);

    // The handler threw, so the outbox keeps the row (backoff, then retry) instead
    // of marking a revoke delivered that never left the process.
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('announces a dead letter instead of failing silently', async () => {
    const { dispatcher, results, deliveries } = harness();
    const warn = jest.spyOn(dispatcher['logger'], 'warn').mockImplementation(() => undefined);
    results.push('dead-letter');
    deliveries.push({ id: 'outbox-1', payload: event as unknown as Record<string, unknown> });

    await dispatcher.drain(5);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('group_room_revoke_dead_letter'));
  });

  it('treats an unparseable payload as a permanent failure', async () => {
    const { dispatcher, publish, results, deliveries } = harness();
    const warn = jest.spyOn(dispatcher['logger'], 'warn').mockImplementation(() => undefined);
    results.push('dead-letter');
    deliveries.push({ id: 'outbox-1', payload: { subjectId: 'user-1' } });

    await dispatcher.drain(5);

    expect(publish).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('group_room_revoke_dead_letter'));
  });

  it('does not retry a publish it cannot perform at all (single instance, no Redis)', async () => {
    const { dispatcher, publish, results, deliveries } = harness({ redisPresent: false });
    results.push('succeeded');
    deliveries.push({ id: 'outbox-1', payload: event as unknown as Record<string, unknown> });

    await expect(dispatcher.drain(5)).resolves.toBe(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it('stops as soon as the topic is idle', async () => {
    const { dispatcher, handler } = harness();

    await expect(dispatcher.drain(25)).resolves.toBe(0);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
