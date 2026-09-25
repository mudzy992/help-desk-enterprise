import { composeTicketEmail, isConfidentialForEmail, resolveEmailLocale } from './compose-ticket-email';
import { createEmailChannelTestConfiguration } from './email-channel-test-configuration';

const ticket = {
  id: 'ticket-1',
  ticketNumber: 'HD-1',
  title: 'VPN',
  status: 'ASSIGNED',
  priority: 'HIGH',
  classification: 'INTERNAL',
  isConfidential: false,
};

function compose(configuration = createEmailChannelTestConfiguration(), recipientId = 'u1') {
  return composeTicketEmail({
    configuration,
    key: 'ticket.assigned',
    locale: 'bs',
    ticket,
    serviceName: 'VPN pristup',
    groupName: 'IT',
    recipientName: 'Emir',
    actorName: '',
    event: 'assigned',
    excerpt: null,
    dedupeKey: 'ticket.assigned:msg-1',
    recipientId,
  });
}

describe('composeTicketEmail', () => {
  it('threads every ticket e-mail and suppresses auto-replies', () => {
    const email = compose();
    expect(email.headers).toMatchObject({
      'In-Reply-To': '<ticket-ticket-1@epbih.ba>',
      References: '<ticket-ticket-1@epbih.ba>',
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
      'X-EPHD-Ticket': 'HD-1',
    });
    expect(email.replyTo).toBeUndefined();
    expect(email.text).toContain('https://desk.epbih.ba/tickets/ticket-1');
    expect(email.text).toContain('Dodijeljen');
  });

  it('keeps the Message-ID stable per event and recipient', () => {
    expect(compose().messageId).toBe(compose().messageId);
    expect(compose(undefined, 'u2').messageId).not.toBe(compose().messageId);
    expect(compose().messageId).toMatch(/^<[0-9a-f]{32}@epbih\.ba>$/);
  });

  it('sets Reply-To only in the shared mailbox mode', () => {
    const email = compose(
      createEmailChannelTestConfiguration({}, {
        replyMode: 'shared_mailbox',
        configuredReplyMode: 'shared_mailbox',
        replyToAddress: 'podrska@epbih.ba',
      }),
    );
    expect(email.replyTo).toBe('podrska@epbih.ba');
    expect(email.text).toContain('Na ovu poruku možete odgovoriti');
  });

  it('omits links when APP_PUBLIC_URL is missing', () => {
    const email = compose(createEmailChannelTestConfiguration({}, { publicUrl: null }));
    expect(email.html).not.toContain('<a href=');
  });
});

describe('ticket description placeholders', () => {
  function withBody(body: string, overrides: Partial<typeof ticket & { description: string }> = {}) {
    const configuration = createEmailChannelTestConfiguration();
    const base = configuration.templates;
    return composeTicketEmail({
      configuration,
      templates: {
        ...base,
        bs: { ...base.bs, 'ticket.created': { ...base.bs['ticket.created'], body } },
      },
      key: 'ticket.created',
      locale: 'bs',
      ticket: { ...ticket, description: `${'x'.repeat(400)} lozinka: Tajna123`, ...overrides },
      serviceName: 'VPN',
      groupName: 'IT',
      recipientName: 'E',
      actorName: '',
      event: 'created',
      excerpt: null,
      dedupeKey: 'd',
      recipientId: 'u',
    });
  }

  it('offers full and shortened content, redacted', () => {
    const full = withBody('Opis: {{ticketDescription}}');
    expect(full.text).toContain('[REDACTED]');
    expect(full.text).not.toContain('Tajna123');
    const short = withBody('Opis: {{ticketDescriptionShort}}');
    expect(short.text).toContain('…');
    expect(short.text).not.toContain('[REDACTED]');
  });

  it('is empty for confidential tickets', () => {
    const email = withBody('Opis: {{ticketDescription}}', { isConfidential: true });
    expect(email.text).not.toContain('xxxx');
  });
});

describe('isConfidentialForEmail', () => {
  it('treats the flag and CONFIDENTIAL/RESTRICTED classification as confidential', () => {
    expect(isConfidentialForEmail(ticket)).toBe(false);
    expect(isConfidentialForEmail({ ...ticket, isConfidential: true })).toBe(true);
    expect(isConfidentialForEmail({ ...ticket, classification: 'CONFIDENTIAL' })).toBe(true);
    expect(isConfidentialForEmail({ ...ticket, classification: 'RESTRICTED' })).toBe(true);
  });
});

describe('resolveEmailLocale', () => {
  const configuration = createEmailChannelTestConfiguration();
  it('uses a supported preference and otherwise the installation default', () => {
    expect(resolveEmailLocale('en', configuration)).toBe('en');
    expect(resolveEmailLocale('en-GB', configuration)).toBe('en');
    expect(resolveEmailLocale('de', configuration)).toBe('bs');
    expect(resolveEmailLocale(null, configuration)).toBe('bs');
    expect(
      resolveEmailLocale(
        'en',
        createEmailChannelTestConfiguration({}, { supportedLocales: ['bs'] }),
      ),
    ).toBe('bs');
  });
});
