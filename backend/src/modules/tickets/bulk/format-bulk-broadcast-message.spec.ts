import {
  formatBulkBroadcastMessage,
  prepareBulkBroadcastMessage,
  toBroadcastTextLocale,
} from './format-bulk-broadcast-message';
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

describe('formatBulkBroadcastMessage — language of the labels (Val 3, M12/B5)', () => {
  const input = {
    ticketIds: ['a'],
    actionType: 'broadcast_message',
    whatHappened: 'Prekid u 18h',
    whoAffected: 'Sve službe',
    eta: '1h',
    workaround: 'Koristite LTE',
  } as never;

  it('renders Bosnian labels by default', () => {
    const text = formatBulkBroadcastMessage(input, defaultTicketBulkConfiguration);
    expect(text).toContain('Šta se desilo: Prekid u 18h');
    expect(text).toContain('Koga pogađa: Sve službe');
    expect(text).toContain('Procjena rješenja (ETA): 1h');
    expect(text).toContain('Zaobilazno rješenje: Koristite LTE');
  });

  it('renders English labels on request and keeps the parts for a re-render', () => {
    const prepared = prepareBulkBroadcastMessage(
      input,
      defaultTicketBulkConfiguration,
      'en',
    );
    expect(prepared.text).toContain('What happened: Prekid u 18h');
    expect(prepared.text).toContain('Workaround: Koristite LTE');
    expect(prepared.parts.workaround).toBe('Koristite LTE');
    expect(toBroadcastTextLocale('en-GB')).toBe('en');
    expect(toBroadcastTextLocale('de')).toBeNull();
  });

  it('omits the workaround when the configuration does not allow it', () => {
    const text = formatBulkBroadcastMessage(input, {
      ...defaultTicketBulkConfiguration,
      broadcastAllowWorkaround: false,
    });
    expect(text).not.toContain('Koristite LTE');
  });
});
