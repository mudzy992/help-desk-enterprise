import { renderEmailTemplate } from './render-email-template';

describe('renderEmailTemplate', () => {
  it('replaces allow-listed placeholders and strips unknown ones', () => {
    expect(
      renderEmailTemplate(
        {
          subject: 'Tiket {{ticketNumber}}',
          body: '{{ticketTitle}} / {{unknown}} / {{ticketId}}',
        },
        {
          ticketNumber: 'HD-12',
          ticketTitle: 'VPN',
          ticketId: 'ticket-1',
          type: 'ticket.created',
          event: 'created',
        },
      ),
    ).toEqual({
      subject: 'Tiket HD-12',
      text: 'VPN /  / ticket-1',
    });
  });

  it('does not interpolate nested placeholders from values', () => {
    expect(
      renderEmailTemplate(
        { subject: '{{ticketTitle}}', body: '{{ticketNumber}}' },
        {
          ticketNumber: 'HD-1',
          ticketTitle: '{{ticketNumber}}',
          ticketId: 'id',
          type: 'ticket.created',
          event: 'created',
        },
      ).subject,
    ).toBe('{{ticketNumber}}');
  });
});
