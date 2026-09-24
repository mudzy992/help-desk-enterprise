import { parseTicketRealtimeBridgePayload } from './parse-ticket-realtime-bridge-payload';

const message = { id: 'msg-1', ticketId: 'ticket-1', visibility: 'public' };
const updated = { ticketId: 'ticket-1', change: 'archived', visibility: 'public' };

describe('parseTicketRealtimeBridgePayload', () => {
  it('accepts both envelope kinds', () => {
    expect(parseTicketRealtimeBridgePayload({ kind: 'message', payload: message })).toEqual({
      kind: 'message',
      payload: message,
    });
    expect(
      parseTicketRealtimeBridgePayload({ kind: 'updated', payload: updated }),
    ).toEqual({ kind: 'updated', payload: updated });
  });

  it('rejects unknown kinds and payloads without a ticket', () => {
    expect(parseTicketRealtimeBridgePayload({ kind: 'notification', payload: message })).toBeNull();
    expect(parseTicketRealtimeBridgePayload({ kind: 'message', payload: { id: 'm' } })).toBeNull();
    expect(parseTicketRealtimeBridgePayload({ kind: 'updated', payload: { ticketId: 't' } })).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    expect(parseTicketRealtimeBridgePayload(null)).toBeNull();
    expect(parseTicketRealtimeBridgePayload('{"kind":"message"}')).toBeNull();
    expect(parseTicketRealtimeBridgePayload({ kind: 'message', payload: null })).toBeNull();
  });
});
