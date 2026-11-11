import { TicketRealtimeHub } from './ticket-realtime.hub';
import { parseTicketRealtimeBridgePayload } from './parse-ticket-realtime-bridge-payload';
import type { AnnouncementChangedRealtimePayload } from './ticket-realtime.types';

const payload: AnnouncementChangedRealtimePayload = {
  userId: 'user-1',
  announcementId: 'ann-1',
  occurredAt: '2026-10-29T08:00:00.000Z',
};

describe('BA-announcements-20 announcement realtime channel', () => {
  it('delivers announcement-changed to subscribers and unsubscribes cleanly', () => {
    const hub = new TicketRealtimeHub();
    const seen: string[] = [];
    const off = hub.subscribeAnnouncementChanged((event) => {
      seen.push(`${event.userId}:${event.announcementId}`);
    });
    hub.publishAnnouncementChanged(payload);
    expect(seen).toEqual(['user-1:ann-1']);
    off();
    hub.publishAnnouncementChanged(payload);
    expect(seen).toEqual(['user-1:ann-1']);
  });

  it('best-effort publish isolates a throwing listener; awaited publish propagates it for retry', async () => {
    const hub = new TicketRealtimeHub();
    const seen: string[] = [];
    hub.subscribeAnnouncementChanged(() => {
      throw new Error('listener boom');
    });
    hub.subscribeAnnouncementChanged((event) => {
      seen.push(event.announcementId);
    });
    hub.publishAnnouncementChanged(payload);
    expect(seen).toEqual(['ann-1']);
    await expect(hub.publishAnnouncementChangedAwaited(payload)).rejects.toThrow('listener boom');
  });

  it('bridge parser accepts announcement-changed envelopes', () => {
    expect(parseTicketRealtimeBridgePayload({ kind: 'announcement-changed', payload })).toEqual({
      kind: 'announcement-changed',
      payload,
    });
  });

  it('bridge parser rejects announcement-changed without user or announcement id', () => {
    expect(
      parseTicketRealtimeBridgePayload({ kind: 'announcement-changed', payload: { announcementId: 'a' } }),
    ).toBeNull();
    expect(
      parseTicketRealtimeBridgePayload({ kind: 'announcement-changed', payload: { userId: 'u' } }),
    ).toBeNull();
    expect(parseTicketRealtimeBridgePayload({ kind: 'announcement-changed', payload: null })).toBeNull();
  });
});
