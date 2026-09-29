import { createReplyTokenMessageId, readReplyTokenSecret } from '../notifications/email/reply-token';
import { checkSenderAuthentication } from './check-sender-authentication';
import { composeInboundNoticeEmail } from './compose-inbound-notice-email';
import { detectAutoReply } from './detect-auto-reply';
import { cleanSubject, extractReplyText } from './extract-reply-text';
import { inboundConfigurationProblems, type InboundEmailConfiguration } from './inbound-email-configuration';
import type { InboundAttachment, InboundMessage } from './inbound-email.types';
import { parseInboundMessage } from './parse-inbound-message';
import {
  InboundTicketError,
  processInboundMessage,
  type InboundProcessingOptions,
  type InboundProcessingPorts,
  type InboundTicket,
} from './process-inbound-message';
import { resolveInboundTarget } from './resolve-inbound-target';

const secret = Buffer.alloc(32, 7);
const passHeaders: [string, string[]][] = [['authentication-results', ['mx.epbih.ba; spf=pass; dkim=pass; dmarc=pass']]];

function message(overrides: Partial<InboundMessage> & { headerList?: [string, string[]][] } = {}): InboundMessage {
  const { headerList, ...rest } = overrides;
  return {
    messageId: '<m1@mail.epbih.ba>',
    inReplyTo: null,
    references: [],
    fromAddress: 'ana@epbih.ba',
    fromName: 'Ana',
    subject: 'RE: [T-000123] Printer',
    text: 'Printer radi, hvala.\n\nOn Mon, 1 Oct 2026 Help Desk wrote:\n> old text',
    receivedAt: new Date('2026-10-01T08:00:00Z'),
    headers: new Map(headerList ?? passHeaders),
    attachments: [],
    ...rest,
  };
}

function ticket(overrides: Partial<InboundTicket> = {}): InboundTicket {
  return { id: 'ticket0001', ticketNumber: 'T-000123', status: 'IN_PROGRESS', mergedIntoTicketId: null, ...overrides };
}

function ports(overrides: Partial<InboundProcessingPorts> = {}) {
  const calls: { kind: string; args: unknown[] }[] = [];
  const record =
    <T>(kind: string, value: T) =>
    async (...args: unknown[]) => {
      calls.push({ kind, args });
      return value;
    };
  const base: InboundProcessingPorts = {
    findSenderByEmail: record('findSender', { id: 'user00001', email: 'ana@epbih.ba', isActive: true }),
    findTicketById: record('findTicketById', ticket()),
    findTicketByNumber: record('findTicketByNumber', ticket()),
    countRecentFromSender: record('countRecent', 0),
    addReply: record('addReply', { messageId: 'msg1' }),
    reopenWithReply: record('reopen', { messageId: 'msg2' }),
    attach: record('attach', undefined),
    noteRejectedAttachment: record('note', undefined),
    createTicket: record('createTicket', { ticketId: 'newticket1' }),
    sendNotice: record('notice', undefined),
  };
  return { ports: { ...base, ...overrides }, calls };
}

const options: InboundProcessingOptions = {
  ownAddresses: ['helpdesk@epbih.ba'],
  replyTokenSecret: secret,
  requireAuthPass: true,
  recipientPolicy: { internalOnly: true, internalDomains: ['epbih.ba'], allowedExternalDomains: [], allowedExternalEmails: [] },
  maxPerSenderPerHour: 20,
  createTickets: false,
  maxBodyLength: 8000,
  now: new Date('2026-10-01T08:00:10Z'),
};

describe('Paket 2.3 — reply token and target', () => {
  it('round-trips a signed token and rejects a tampered one', () => {
    const id = createReplyTokenMessageId({ secret, ticketId: 'ticket0001', recipientId: 'user00001', dedupeKey: 'k', domain: 'epbih.ba' });
    expect(id).not.toBeNull();
    const target = resolveInboundTarget(message({ inReplyTo: id }), secret);
    expect(target).toEqual({ kind: 'token', ticketId: 'ticket0001', recipientId: 'user00001' });
    const tampered = (id ?? '').replace('ticket0001', 'ticket0002');
    expect(resolveInboundTarget(message({ inReplyTo: tampered, subject: 'hello' }), secret).kind).toBe('new');
    expect(resolveInboundTarget(message({ inReplyTo: id, subject: 'x' }), Buffer.alloc(32, 1)).kind).toBe('new');
  });

  it('falls back to the 1.5 thread root, then the subject number', () => {
    expect(resolveInboundTarget(message({ references: ['<ticket-ticket0009@epbih.ba>'] }), secret)).toEqual({
      kind: 'thread',
      ticketId: 'ticket0009',
    });
    expect(resolveInboundTarget(message(), secret)).toEqual({ kind: 'subject', ticketNumber: 'T-000123' });
    expect(resolveInboundTarget(message({ subject: 'Novi problem' }), secret)).toEqual({ kind: 'new' });
  });

  it('derives the secret from MFA_ENCRYPTION_KEY when no dedicated secret is set', () => {
    expect(readReplyTokenSecret({})).toBeNull();
    expect(readReplyTokenSecret({ INBOUND_EMAIL_TOKEN_SECRET: 'short' })).toBeNull();
    expect(readReplyTokenSecret({ INBOUND_EMAIL_TOKEN_SECRET: 'a-very-long-dedicated-secret' })).not.toBeNull();
  });
});

describe('Paket 2.3 — anti-loop and sender authentication', () => {
  it.each<[string, [string, string[]][], Partial<InboundMessage>]>([
    ['Auto-Submitted', [['auto-submitted', ['auto-replied']]], {}],
    ['X-Auto-Response-Suppress', [['x-auto-response-suppress', ['All']]], {}],
    ['Precedence bulk', [['precedence', ['bulk']]], {}],
    ['List-Id', [['list-id', ['<news.epbih.ba>']]], {}],
    ['out of office subject', [], { subject: 'Automatski odgovor: Printer' }],
    ['mailer-daemon', [], { fromAddress: 'mailer-daemon@epbih.ba' }],
  ])('ignores %s', (_label, headerList, overrides) => {
    expect(detectAutoReply(message({ headerList, ...overrides }), ['helpdesk@epbih.ba'])).not.toBeNull();
  });

  it('ignores our own address and accepts a normal reply', () => {
    expect(detectAutoReply(message({ fromAddress: 'helpdesk@epbih.ba' }), ['helpdesk@epbih.ba'])).toBe('OWN_MESSAGE');
    expect(detectAutoReply(message(), ['helpdesk@epbih.ba'])).toBeNull();
  });

  it('reads DMARC / SPF+DKIM from the topmost Authentication-Results', () => {
    expect(checkSenderAuthentication(message())).toBe('pass');
    expect(checkSenderAuthentication(message({ headerList: [['authentication-results', ['x; spf=pass; dkim=pass']]] }))).toBe('pass');
    expect(checkSenderAuthentication(message({ headerList: [['authentication-results', ['x; spf=fail; dmarc=fail']]] }))).toBe('fail');
    expect(checkSenderAuthentication(message({ headerList: [] }))).toBe('none');
    expect(checkSenderAuthentication(message({ headerList: [['x-ms-exchange-organization-authas', ['Internal']]] }))).toBe('pass');
  });
});

describe('Paket 2.3 — reply text cleaning', () => {
  it.each([
    ['Gmail en', 'Radi sada.\n\nOn Tue, Oct 1, 2026 at 9:00 AM Help Desk <helpdesk@epbih.ba> wrote:\n> Stari tekst', 'Radi sada.'],
    ['Outlook bs', 'Hvala.\n\nOd: Help Desk\nPoslano: utorak\nZa: Ana\nPredmet: RE: x\n\nStari tekst', 'Hvala.'],
    ['Outlook en separator', 'OK\n-----Original Message-----\nFrom: x', 'OK'],
    ['quoted lines', 'Da.\n> ranije', 'Da.'],
    ['mobile signature', 'Uredu.\n\nSent from my iPhone', 'Uredu.'],
    ['dash signature', 'Riješeno.\n-- \nAna Anić\nIT', 'Riješeno.'],
  ])('%s', (_label, input, expected) => {
    expect(extractReplyText(input, 8000)).toBe(expected);
  });

  it('strips reply prefixes from the subject', () => {
    expect(cleanSubject('RE: FW: Odg: Printer ne radi')).toBe('Printer ne radi');
  });
});

describe('Paket 2.3 — processInboundMessage', () => {
  it('adds the cleaned reply to the ticket from the subject number', async () => {
    const { ports: p, calls } = ports();
    const outcome = await processInboundMessage(message(), p, options);
    expect(outcome).toEqual({ status: 'PROCESSED', ticketId: 'ticket0001', ticketMessageId: 'msg1', notes: [] });
    expect(calls.find((call) => call.kind === 'addReply')?.args).toEqual(['ticket0001', 'user00001', 'Printer radi, hvala.']);
  });

  it.each<[string, Partial<InboundProcessingPorts>, Partial<InboundProcessingOptions>, Partial<InboundMessage> & { headerList?: [string, string[]][] }, string]>([
    ['unknown sender', { findSenderByEmail: async () => null }, {}, {}, 'UNKNOWN_SENDER'],
    ['inactive sender', { findSenderByEmail: async () => ({ id: 'u', email: 'ana@epbih.ba', isActive: false }) }, {}, {}, 'SENDER_INACTIVE'],
    ['external domain', {}, {}, { fromAddress: 'eve@gmail.com' }, 'SENDER_DOMAIN_NOT_ALLOWED'],
    ['DMARC fail', {}, {}, { headerList: [['authentication-results', ['x; dmarc=fail']]] }, 'AUTHENTICATION_FAILED'],
    ['rate limit', { countRecentFromSender: async () => 20 }, {}, {}, 'RATE_LIMITED'],
    ['no ticket match', {}, {}, { subject: 'Pitanje' }, 'NO_TICKET_MATCH'],
    ['ticket missing', { findTicketByNumber: async () => null }, {}, {}, 'TICKET_NOT_FOUND'],
    ['empty reply', {}, {}, { text: '> samo citat' }, 'EMPTY_REPLY'],
    ['no access', { addReply: async () => Promise.reject(new InboundTicketError('FORBIDDEN')) }, {}, {}, 'FORBIDDEN'],
  ])('rejects: %s', async (_label, portOverrides, optionOverrides, messageOverrides, reason) => {
    const { ports: p } = ports(portOverrides);
    const outcome = await processInboundMessage(message(messageOverrides), p, { ...options, ...optionOverrides });
    expect(outcome).toMatchObject({ status: 'REJECTED', reason });
  });

  it('lets a missing Authentication-Results through when the check is off', async () => {
    const { ports: p } = ports();
    const outcome = await processInboundMessage(message({ headerList: [] }), p, { ...options, requireAuthPass: false });
    expect(outcome.status).toBe('PROCESSED');
  });

  it('closed ticket: no message, one informational notice', async () => {
    const { ports: p, calls } = ports({ findTicketByNumber: async () => ticket({ status: 'CLOSED' }) });
    const outcome = await processInboundMessage(message(), p, options);
    expect(outcome).toMatchObject({ status: 'REJECTED', reason: 'TICKET_CLOSED' });
    expect(calls.filter((call) => call.kind === 'addReply')).toHaveLength(0);
    expect(calls.filter((call) => call.kind === 'notice').map((call) => call.args[0])).toEqual(['ticket_closed']);
  });

  it('resolved ticket is reopened with the reply', async () => {
    const { ports: p, calls } = ports({ findTicketByNumber: async () => ticket({ status: 'RESOLVED' }) });
    const outcome = await processInboundMessage(message(), p, options);
    expect(outcome).toMatchObject({ status: 'PROCESSED', ticketMessageId: 'msg2' });
    expect(calls.some((call) => call.kind === 'reopen')).toBe(true);
  });

  it('redaction block notifies the sender without quoting', async () => {
    const { ports: p, calls } = ports({ addReply: async () => Promise.reject(new InboundTicketError('REDACTION_BLOCKED')) });
    const outcome = await processInboundMessage(message(), p, options);
    expect(outcome).toMatchObject({ status: 'REJECTED', reason: 'REDACTION_BLOCKED' });
    expect(calls.find((call) => call.kind === 'notice')?.args[0]).toBe('reply_blocked');
  });

  it('follows a merged child to its parent', async () => {
    const { ports: p, calls } = ports({
      findTicketByNumber: async () => ticket({ id: 'child0001', mergedIntoTicketId: 'parent001' }),
      findTicketById: async () => ticket({ id: 'parent001' }),
    });
    const outcome = await processInboundMessage(message(), p, options);
    expect(outcome).toMatchObject({ status: 'PROCESSED', ticketId: 'parent001' });
    expect(calls.find((call) => call.kind === 'addReply')?.args[0]).toBe('parent001');
  });

  it('opens a ticket from a new e-mail only when enabled', async () => {
    const { ports: p, calls } = ports();
    const outcome = await processInboundMessage(message({ subject: 'FW: Novi laptop', text: 'Trebam laptop.' }), p, {
      ...options,
      createTickets: true,
    });
    expect(outcome).toMatchObject({ status: 'PROCESSED', createdTicketId: 'newticket1' });
    expect(calls.find((call) => call.kind === 'createTicket')?.args).toEqual(['user00001', 'Novi laptop', 'Trebam laptop.']);
  });

  it('skips small inline images, attaches the rest and notes rejected files', async () => {
    const file = (filename: string, size: number, inline: boolean): InboundAttachment => ({
      filename,
      contentType: 'image/png',
      size,
      content: Buffer.alloc(1),
      inline,
    });
    const attached: string[] = [];
    const { ports: p, calls } = ports({
      attach: async (_ticketId, _senderId, attachment) => {
        if (attachment.filename === 'virus.exe') throw new InboundTicketError('ATTACHMENT_TYPE_NOT_ALLOWED');
        attached.push(attachment.filename);
      },
    });
    const outcome = await processInboundMessage(
      message({ attachments: [file('logo.png', 2000, true), file('screen.png', 200_000, false), file('virus.exe', 10, false)] }),
      p,
      options,
    );
    expect(attached).toEqual(['screen.png']);
    expect(outcome).toMatchObject({ status: 'PROCESSED', notes: ['virus.exe:ATTACHMENT_TYPE_NOT_ALLOWED'] });
    expect(calls.find((call) => call.kind === 'note')?.args).toEqual(['ticket0001', 'virus.exe', 'ATTACHMENT_TYPE_NOT_ALLOWED']);
  });
});

describe('Paket 2.3 — parsing, configuration and notices', () => {
  it('parses a raw RFC 5322 message', async () => {
    const raw = Buffer.from(
      [
        'From: Ana <Ana@epbih.ba>',
        'To: helpdesk@epbih.ba',
        'Subject: RE: [T-000123] Printer',
        'Message-ID: <abc@epbih.ba>',
        'In-Reply-To: <r.x@epbih.ba>',
        'Authentication-Results: mx; dmarc=pass',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Radi.',
      ].join('\r\n'),
    );
    const parsed = await parseInboundMessage(raw);
    expect(parsed.fromAddress).toBe('ana@epbih.ba');
    expect(parsed.subject).toBe('RE: [T-000123] Printer');
    expect(parsed.headers.get('authentication-results')?.[0]).toContain('dmarc=pass');
    expect(parsed.text.trim()).toBe('Radi.');
  });

  it('lists missing configuration', () => {
    const configuration = {
      enabled: true,
      provider: 'graph',
      address: '',
      graph: { tenantId: '', clientId: '', clientSecret: '' },
      imap: { host: '', port: 993, tls: true, username: '', password: '', authMethod: 'password' },
      createTickets: true,
      defaultServiceId: '',
    } as unknown as InboundEmailConfiguration;
    expect(inboundConfigurationProblems(configuration)).toEqual(['ADDRESS_MISSING', 'ENTRA_APP_MISSING', 'DEFAULT_SERVICE_MISSING']);
  });

  it('notice carries RFC 3834 headers and never the original text', () => {
    const notice = composeInboundNoticeEmail({ kind: 'ticket_closed', locale: 'bs', ticketNumber: 'T-000123', url: 'https://desk/tickets/new' });
    expect(notice.subject.startsWith('[T-000123]')).toBe(true);
    expect(notice.headers['Auto-Submitted']).toBe('auto-replied');
    expect(notice.text).toContain('https://desk/tickets/new');
  });
});
