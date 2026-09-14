import { broadcastEdgeEventRealtime } from './broadcast-edge-realtime';

describe('broadcastEdgeEventRealtime', () => {
  it('emits to the user room and optional ticket room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    broadcastEdgeEventRealtime(
      { to } as never,
      {
        userId: 'user-1',
        ticketId: 'ticket-1',
        eventName: 'notification.created',
        data: { unreadCount: 1 },
      },
    );
    expect(to).toHaveBeenCalledWith('user:user-1');
    expect(to).toHaveBeenCalledWith('ticket:ticket-1');
    expect(emit).toHaveBeenCalledWith('notification.created', {
      unreadCount: 1,
    });
  });
});
