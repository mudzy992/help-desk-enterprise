import { buildDigestRows, composeDigestEmail } from './compose-digest-email';
import { createEmailChannelTestConfiguration } from './email-channel-test-configuration';

const ticket = (id: string, number: string, isConfidential = false) => ({
  id,
  ticketNumber: number,
  title: `Title ${number}`,
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  isConfidential,
});
const tickets = new Map([
  ['a', ticket('a', 'HD-1')],
  ['b', ticket('b', 'HD-2', true)],
  ['c', ticket('c', 'HD-3')],
]);
const items = [
  { ticketId: 'a', category: 'ticket.message', createdAt: new Date('2026-09-28T06:00:00Z') },
  { ticketId: 'a', category: 'ticket.message', createdAt: new Date('2026-09-28T08:00:00Z') },
  { ticketId: 'b', category: 'ticket.created', createdAt: new Date('2026-09-28T07:00:00Z') },
  { ticketId: 'c', category: 'ticket.created', createdAt: new Date('2026-09-28T05:00:00Z') },
  { ticketId: 'gone', category: 'ticket.created', createdAt: new Date('2026-09-28T09:00:00Z') },
];

describe('digest e-mail (paket 2.2)', () => {
  it('groups by ticket, newest first, hides confidential titles and caps the list', () => {
    const result = buildDigestRows({ items, tickets, locale: 'en', publicUrl: 'https://desk.epbih.ba', maxItems: 2 });
    expect(result.total).toBe(3);
    expect(result.rows.map((row) => [row.ticketNumber, row.eventCount, row.title])).toEqual([
      ['HD-1', 2, 'Title HD-1'],
      ['HD-2', 1, ''],
    ]);
    expect(result.rows[0]?.url).toBe('https://desk.epbih.ba/tickets/a');
    expect(result.more).not.toBeNull();
  });

  it('builds an auto-submitted message with a stable Message-ID and a manage link', () => {
    const input = {
      configuration: createEmailChannelTestConfiguration(),
      locale: 'bs' as const,
      recipientId: 'user-1',
      recipientName: 'Amra',
      items,
      tickets,
      maxItems: 50,
      dedupeKey: 'digest:2026-09-28T05:30:00.000Z:item-9',
    };
    const first = composeDigestEmail(input);
    expect(first.messageId).toBe(composeDigestEmail(input).messageId);
    expect(first.headers['Auto-Submitted']).toBe('auto-generated');
    expect(first.ticketCount).toBe(3);
    expect(first.html).toContain('/account/notifications');
    expect(first.text).not.toContain('Title HD-2');
  });
});
