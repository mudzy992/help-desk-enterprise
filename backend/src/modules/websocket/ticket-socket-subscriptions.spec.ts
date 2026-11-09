import type { Socket } from 'socket.io';
import {
  maxTicketSubscriptionsPerSocket,
  TicketSocketSubscriptionRegistry,
} from './ticket-socket-subscriptions';

function socket(id: string): Socket {
  return { id } as Socket;
}

describe('TicketSocketSubscriptionRegistry', () => {
  it('advances access epochs and rejects registration from an older epoch', () => {
    const registry = new TicketSocketSubscriptionRegistry();
    const client = socket('socket-1');
    registry.beginJoin(client, 'ticket-1');

    expect(registry.register(client, 'ticket-1', 'staff', 0)).toBe(true);
    registry.finishJoin(client, 'ticket-1');
    expect(registry.advanceEpoch('ticket-1')).toBe(1);
    expect(registry.hasCurrentSubscription(client, 'ticket-1')).toBe(false);
    expect(registry.register(client, 'ticket-1', 'public', 0)).toBe(false);
    expect(registry.register(client, 'ticket-1', 'public', 1)).toBe(true);
    expect(registry.hasCurrentSubscription(client, 'ticket-1')).toBe(true);
    expect(registry.subscriptionFor(client, 'ticket-1')).toMatchObject({
      visibility: 'public',
      epoch: 1,
    });
  });

  it('includes joins that race an access update and prunes their epoch on completion', () => {
    const registry = new TicketSocketSubscriptionRegistry();
    const client = socket('socket-joining');

    expect(registry.advanceEpoch('ticket-2')).toBeNull();
    registry.beginJoin(client, 'ticket-2');
    expect(registry.socketsForTicket('ticket-2')).toEqual([client]);
    expect(registry.advanceEpoch('ticket-2')).toBe(1);
    expect(registry.register(client, 'ticket-2', 'public', 0)).toBe(false);
    registry.finishJoin(client, 'ticket-2');

    expect(registry.activeTicketIds()).toEqual([]);
    expect(registry.currentEpoch('ticket-2')).toBe(0);
  });

  it('bounds the union of active and pending tickets, without counting duplicates twice', () => {
    const registry = new TicketSocketSubscriptionRegistry();
    const client = socket('socket-limit');
    expect(registry.beginJoin(client, 'active')).toBe(true);
    expect(registry.register(client, 'active', 'public', 0)).toBe(true);
    registry.finishJoin(client, 'active');
    for (let i = 0; i < maxTicketSubscriptionsPerSocket - 1; i += 1) {
      expect(registry.beginJoin(client, `pending-${i}`)).toBe(true);
    }
    expect(registry.beginJoin(client, 'pending-0')).toBe(true);
    registry.finishJoin(client, 'pending-0');
    expect(registry.socketsForTicket('pending-0')).toEqual([client]);
    expect(registry.beginJoin(client, 'overflow')).toBe(false);
    expect(registry.beginJoin(client, 'active')).toBe(true);
    registry.finishJoin(client, 'active');
    registry.finishJoin(client, 'pending-0');
    expect(registry.beginJoin(client, 'overflow')).toBe(true);
    registry.removeSocket(client);
    expect(registry.activeTicketIds()).toEqual([]);
    expect(registry.register(client, 'overflow', 'public', 0)).toBe(false);
  });

  it('removes all of a disconnected socket’s subscriptions', () => {
    const registry = new TicketSocketSubscriptionRegistry();
    const client = socket('socket-disconnected');
    registry.beginJoin(client, 'ticket-3');
    expect(registry.register(client, 'ticket-3', 'staff', 0)).toBe(true);
    registry.finishJoin(client, 'ticket-3');

    registry.removeSocket(client);

    expect(registry.activeSubscriptions()).toEqual([]);
    expect(registry.activeTicketIds()).toEqual([]);
    expect(registry.currentEpoch('ticket-3')).toBe(0);
  });
});
