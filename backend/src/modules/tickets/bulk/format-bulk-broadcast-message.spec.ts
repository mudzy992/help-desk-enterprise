import { formatBulkBroadcastMessage } from './format-bulk-broadcast-message';
import { defaultTicketBulkConfiguration } from './bulk.constants';

describe('formatBulkBroadcastMessage', () => {
  it('requires structured fields and can reject links', () => {
    expect(() =>
      formatBulkBroadcastMessage(
        { ticketIds: ['a'], actionType: 'broadcast_message' },
        defaultTicketBulkConfiguration,
      ),
    ).toThrow();
    const text = formatBulkBroadcastMessage(
      {
        ticketIds: ['a'],
        actionType: 'broadcast_message',
        whatHappened: 'Outage',
        whoAffected: 'Campus',
        eta: '1h',
        workaround: 'Use LTE',
      },
      defaultTicketBulkConfiguration,
    );
    expect(text).toContain('Outage');
    expect(() =>
      formatBulkBroadcastMessage(
        {
          ticketIds: ['a'],
          actionType: 'broadcast_message',
          whatHappened: 'See https://example.com',
          whoAffected: 'Campus',
          eta: '1h',
        },
        { ...defaultTicketBulkConfiguration, broadcastAllowLinks: false },
      ),
    ).toThrow();
  });
});
