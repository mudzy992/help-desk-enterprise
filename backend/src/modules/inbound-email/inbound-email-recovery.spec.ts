import type { EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { InboundEmailService } from './inbound-email.service';
import type { InboundEmailConfiguration } from './inbound-email-configuration';
import type { InboundMailboxItem, InboundMailboxSession } from './mailbox/inbound-mailbox';

describe('InboundEmailService crash recovery', () => {
  it.each(['PROCESSING', 'FAILED'])('leaves a legacy %s attempt for manual reconciliation', async (status) => {
    const existing = {
      id: 'inbound-row-legacy',
      status,
      attempts: 1,
      processingPhase: null,
      processingOwnerToken: null,
      processingLeaseExpiresAt: null,
      ticketId: null,
      ticketMessageId: null,
      createdTicketId: null,
    };
    const inboundEmail = { findUnique: jest.fn().mockResolvedValue(existing), updateMany: jest.fn() };
    const service = new InboundEmailService({ inboundEmail } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const move = jest.fn(async () => undefined);
    const session = { move } as unknown as InboundMailboxSession;
    const handleItem = (service as unknown as {
      handleItem: (
        configuration: InboundEmailConfiguration,
        email: EmailChannelConfiguration,
        mailboxKey: string,
        session: InboundMailboxSession,
        item: InboundMailboxItem,
        now: Date,
      ) => Promise<string>;
    }).handleItem.bind(service);

    const result = await handleItem(
      {} as InboundEmailConfiguration,
      {} as EmailChannelConfiguration,
      'imap:helpdesk@example.test',
      session,
      { providerMessageId: 'provider-legacy', raw: Buffer.from('unused') },
      new Date(),
    );

    expect(result).toBe('SKIPPED');
    expect(inboundEmail.updateMany).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it('still parks a technical failure at the existing retry limit when no ticket mutation started', async () => {
    const existing = {
      id: 'inbound-row-limit',
      status: 'FAILED',
      attempts: 3,
      processingPhase: 'PARSED',
      processingOwnerToken: null,
      processingLeaseExpiresAt: null,
      ticketId: null,
      ticketMessageId: null,
      createdTicketId: null,
    };
    const prisma = { inboundEmail: { findUnique: jest.fn().mockResolvedValue(existing) } };
    const service = new InboundEmailService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const move = jest.fn(async () => undefined);
    const session = { move } as unknown as InboundMailboxSession;
    const handleItem = (service as unknown as {
      handleItem: (
        configuration: InboundEmailConfiguration,
        email: EmailChannelConfiguration,
        mailboxKey: string,
        session: InboundMailboxSession,
        item: InboundMailboxItem,
        now: Date,
      ) => Promise<string>;
    }).handleItem.bind(service);

    const result = await handleItem(
      {} as InboundEmailConfiguration,
      {} as EmailChannelConfiguration,
      'imap:helpdesk@example.test',
      session,
      { providerMessageId: 'provider-limit', raw: Buffer.from('unused') },
      new Date(),
    );

    expect(result).toBe('SKIPPED');
    expect(move).toHaveBeenCalledWith('provider-limit', 'rejected');
  });

  it('replays an acknowledged ticket write after a lost response without creating a duplicate', async () => {
    type TestRow = {
      id: string;
      status: string;
      attempts: number;
      processingOwnerToken: string | null;
      processingLeaseExpiresAt: Date | null;
      [key: string]: unknown;
    };
    type Where = {
      id?: string;
      status?: string;
      processingOwnerToken?: string | null;
      processingLeaseExpiresAt?: null | { lte?: Date; gt?: Date };
    };
    let row: TestRow | null = {
      id: 'inbound-row-01',
      mailboxKey: 'imap:helpdesk@example.test',
      providerMessageId: 'provider-01',
      status: 'FAILED',
      attempts: 2,
      processingOwnerToken: null,
      processingLeaseExpiresAt: null,
      processingPhase: 'TICKET_MUTATION',
      rawStorageKey: null,
      messageIdHeader: null,
      fromAddress: null,
      receivedAt: null,
      subject: '',
      ticketId: null,
      ticketMessageId: null,
      createdTicketId: null,
      reason: 'PREVIOUS_TRANSIENT_FAILURE',
    };
    const persistedMessages = new Map<string, { id: string; ticketId: string; idempotencyKey: string }>();
    let createMessageCalls = 0;
    const inboundEmail = {
      findUnique: jest.fn(async () => row),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        row = Object.assign({
          id: 'inbound-row-01',
          status: 'PROCESSING',
          attempts: 1,
          processingOwnerToken: null,
          processingLeaseExpiresAt: null,
          rawStorageKey: null,
          messageIdHeader: null,
          fromAddress: null,
          receivedAt: null,
          ticketId: null,
          ticketMessageId: null,
          createdTicketId: null,
          reason: null,
        }, data) as TestRow;
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        if (row === null || row.id !== where.id || row.status !== where.status) return { count: 0 };
        if (where.processingOwnerToken !== undefined && row.processingOwnerToken !== where.processingOwnerToken) return { count: 0 };
        const leaseFilter = where.processingLeaseExpiresAt;
        if (leaseFilter === null && row.processingLeaseExpiresAt !== null) return { count: 0 };
        if (leaseFilter !== undefined && leaseFilter !== null) {
          if (leaseFilter.lte !== undefined && (row.processingLeaseExpiresAt === null || row.processingLeaseExpiresAt > leaseFilter.lte)) return { count: 0 };
          if (leaseFilter.gt !== undefined && (row.processingLeaseExpiresAt === null || row.processingLeaseExpiresAt <= leaseFilter.gt)) return { count: 0 };
        }
        for (const [key, value] of Object.entries(data)) {
          if (key === 'attempts' && typeof value === 'object' && value !== null && 'increment' in value) {
            row.attempts += (value as { increment: number }).increment;
          } else {
            row[key] = value;
          }
        }
        return { count: 1 };
      }),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
    };
    const prisma = {
      inboundEmail,
      user: {
        findFirst: jest.fn(async () => ({ id: 'user-01', email: 'ana@example.test', isActive: true })),
      },
      ticket: {
        findUnique: jest.fn(async ({ where }: { where: Record<string, string> }) => {
          if (where.sourceInboundEmailId !== undefined) return null;
          if (where.ticketNumber === 'T-000123') {
            return { id: 'ticket-01', ticketNumber: 'T-000123', status: 'IN_PROGRESS', mergedIntoTicketId: null };
          }
          return null;
        }),
      },
      ticketMessage: {
        findUnique: jest.fn(async ({ where }: { where: { ticketId_idempotencyKey?: { idempotencyKey: string } } }) => {
          if (createMessageCalls === 1) throw new Error('simulated recovery lookup failure after durable ticket write');
          const key = where.ticketId_idempotencyKey?.idempotencyKey;
          return key === undefined ? null : persistedMessages.get(key) ?? null;
        }),
        findFirst: jest.fn(async ({ where }: { where: { idempotencyKey?: { in?: string[] } } }) => {
          const keys = where.idempotencyKey?.in ?? [];
          return keys.map((key) => persistedMessages.get(key)).find((message) => message !== undefined) ?? null;
        }),
      },
    };
    const collaboration = {
      createMessage: jest.fn(async (_ticketId: string, input: { idempotencyKey?: string }) => {
        createMessageCalls += 1;
        const key = input.idempotencyKey!;
        const message = { id: 'message-01', ticketId: 'ticket-01', idempotencyKey: key };
        persistedMessages.set(key, message);
        if (createMessageCalls === 1) throw new Error('simulated lost response after durable ticket write');
        return message;
      }),
    };
    const service = new InboundEmailService(
      prisma as never,
      {} as never,
      {} as never,
      collaboration as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const configuration = {
      provider: 'imap',
      address: 'helpdesk@example.test',
      rawRetentionDays: 0,
      requireAuthPass: true,
      trustedAuthservId: 'mx.example.test',
      maxPerSenderPerHour: 20,
      createTickets: false,
      defaultServiceId: 'service-01',
    } as InboundEmailConfiguration;
    const email = {
      internalOnly: true,
      internalDomains: ['example.test'],
      allowedExternalDomains: [],
      allowedExternalEmails: [],
      smtp: { fromAddress: 'helpdesk@example.test' },
      presentation: { replyToAddress: null },
    } as unknown as EmailChannelConfiguration;
    const raw = Buffer.from([
      'From: Ana <ana@example.test>',
      'To: helpdesk@example.test',
      'Subject: RE: [T-000123] Printer',
      'Message-ID: <recovery-01@example.test>',
      'Authentication-Results: mx.example.test; spf=pass; dkim=pass; dmarc=pass',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Printer is working now.',
    ].join('\r\n'));
    const item: InboundMailboxItem = { providerMessageId: 'provider-01', raw };
    const moves: string[] = [];
    const session = {
      list: jest.fn(async () => [item]),
      move: jest.fn(async (_id: string, destination: string) => { moves.push(destination); }),
      close: jest.fn(async () => undefined),
    } as unknown as InboundMailboxSession;
    const handleItem = (service as unknown as {
      handleItem: (
        configuration: InboundEmailConfiguration,
        email: EmailChannelConfiguration,
        mailboxKey: string,
        session: InboundMailboxSession,
        item: InboundMailboxItem,
        now: Date,
      ) => Promise<string>;
    }).handleItem.bind(service);
    const now = new Date();

    const first = await handleItem(configuration, email, 'imap:helpdesk@example.test', session, item, now);
    expect(first).toBe('FAILED');
    expect(row).toMatchObject({ status: 'FAILED', ticketMessageId: null, processingPhase: 'TICKET_MUTATION', attempts: 3 });
    expect(persistedMessages.size).toBe(1);
    expect(moves).toEqual([]);

    const second = await handleItem(configuration, email, 'imap:helpdesk@example.test', session, item, new Date(now.getTime() + 1_000));
    expect(second).toBe('PROCESSED');
    expect(row).toMatchObject({ status: 'PROCESSED', ticketId: 'ticket-01', ticketMessageId: 'message-01', attempts: 4 });
    expect(createMessageCalls).toBe(1);
    expect(persistedMessages.size).toBe(1);
    expect(moves).toEqual(['processed']);
  });
});
