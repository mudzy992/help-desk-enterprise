import { createHash } from 'node:crypto';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { createInMemoryNotificationEmailDeliveryDelegate } from './create-in-memory-notification-email-delivery-delegate';
import { emailDeliveryStatuses } from './email-template.constants';
import {
  NotificationEmailOutcomeUnknownError,
} from './notification-email-delivery-errors';
import { deliverNotificationEmail } from './deliver-notification-email';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import type { MailTransport, MailTransportResult } from './mail-transport';
import { notificationEmailClaimStaleAfterMs } from './persist-notification-email-delivery';
import type { NotificationEmailDeliveryRecord } from './create-in-memory-notification-email-delivery-delegate';

function createPrisma(): {
  prisma: PrismaService;
  records: Map<string, NotificationEmailDeliveryRecord>;
} {
  const records = new Map<string, NotificationEmailDeliveryRecord>();
  let id = 0;
  return {
    prisma: {
      notificationEmailDelivery: createInMemoryNotificationEmailDeliveryDelegate(
        records,
        () => `delivery-${++id}`,
        () => new Date(),
      ),
    } as unknown as PrismaService,
    records,
  };
}

function acceptedReceipt(overrides: Partial<MailTransportResult> = {}): MailTransportResult {
  return {
    acceptedRecipientCount: 1,
    rejectedRecipientCount: 0,
    messageId: '<provider-message-1@example.test>',
    responseCode: 250,
    failureKind: null,
    ...overrides,
  };
}

describe('deliverNotificationEmail (BA-notifications-10)', () => {
  const configuration = {
    smtp: { fromAddress: 'desk@example.com' },
  } as unknown as EmailChannelConfiguration;
  const input = {
    userId: 'user-1',
    toAddress: 'user@example.com',
    subject: 'Tiket je riješen',
    text: 'Vaš tiket je riješen.',
    templateKey: 'ticket.resolved',
    dedupeKey: 'ticket.resolved:1',
  };
  const fallbackMessageId = `<${createHash('sha256')
    .update('user-1')
    .update('\0')
    .update('ticket.resolved:1')
    .digest('hex')
    .slice(0, 32)}@example.com>`;

  it('marks SENT only after a provider acceptance receipt and persists its evidence', async () => {
    const { prisma, records } = createPrisma();
    const send = jest.fn(async () => acceptedReceipt());

    await deliverNotificationEmail(
      prisma,
      { send } as unknown as MailTransport,
      configuration,
      input,
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'desk@example.com',
        to: 'user@example.com',
        subject: 'Tiket je riješen',
        messageId: fallbackMessageId,
      }),
      configuration.smtp,
    );
    expect([...records.values()][0]).toMatchObject({
      status: emailDeliveryStatuses.sent,
      attempts: 1,
      lastAttemptAt: expect.any(Date),
      providerMessageId: '<provider-message-1@example.test>',
      providerResponseCode: 250,
      providerAcceptedAt: expect.any(Date),
      nextRetryAt: null,
      lastErrorCode: null,
    });
  });

  it('reports an unknown outcome when SMTP accepted but the receipt write fails or loses its claim', async () => {
    for (const failure of ['throw', 'lost-claim'] as const) {
      const { prisma } = createPrisma();
      const delegate = prisma.notificationEmailDelivery as unknown as { updateMany: (args: { data: { status?: string } }) => Promise<{ count: number }> };
      const update = delegate.updateMany.bind(delegate);
      jest.spyOn(delegate, 'updateMany').mockImplementation(async (args) => {
        if (args.data.status === emailDeliveryStatuses.sent) {
          if (failure === 'throw') throw new Error('database response lost');
          return { count: 0 };
        }
        return update(args);
      });
      const send = jest.fn(async () => acceptedReceipt());
      await expect(deliverNotificationEmail(prisma, { send } as unknown as MailTransport, configuration, input)).rejects.toBeInstanceOf(NotificationEmailOutcomeUnknownError);
      expect(send).toHaveBeenCalledTimes(1);
    }
  });

  it('preserves a composer-provided stable Message-ID', async () => {
    const { prisma } = createPrisma();
    const send = jest.fn(async () => acceptedReceipt());

    await deliverNotificationEmail(
      prisma,
      { send } as unknown as MailTransport,
      configuration,
      { ...input, messageId: '<stable-message@example.com>' },
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: '<stable-message@example.com>' }),
      configuration.smtp,
    );
  });

  it('does not send a duplicate after the provider acceptance was recorded', async () => {
    const { prisma, records } = createPrisma();
    const send = jest.fn(async () => acceptedReceipt());

    await deliverNotificationEmail(prisma, { send } as unknown as MailTransport, configuration, input);
    await deliverNotificationEmail(prisma, { send } as unknown as MailTransport, configuration, input);

    expect(send).toHaveBeenCalledTimes(1);
    expect([...records.values()][0]?.status).toBe(emailDeliveryStatuses.sent);
  });

  it('records a known pre-acceptance refusal as FAILED without storing raw error text', async () => {
    const { prisma, records } = createPrisma();
    const failure = Object.assign(new Error('SMTP said private response text'), {
      command: 'RCPT TO',
      responseCode: 451,
    });
    const send = jest.fn(async () => {
      throw failure;
    });

    await expect(
      deliverNotificationEmail(prisma, { send } as unknown as MailTransport, configuration, input),
    ).rejects.toBe(failure);

    expect([...records.values()][0]).toMatchObject({
      status: emailDeliveryStatuses.failed,
      attempts: 1,
      lastErrorCode: 'transient',
      lastErrorResponseCode: 451,
      nextRetryAt: null,
    });
    expect([...records.values()][0]?.lastErrorCode).not.toContain('private');
  });

  it('blocks automatic resend when the SMTP outcome is ambiguous', async () => {
    const { prisma, records } = createPrisma();
    const send = jest.fn(async () => {
      throw new Error('socket closed after DATA');
    });

    await expect(
      deliverNotificationEmail(prisma, { send } as unknown as MailTransport, configuration, input),
    ).rejects.toBeInstanceOf(NotificationEmailOutcomeUnknownError);

    expect([...records.values()][0]).toMatchObject({
      status: emailDeliveryStatuses.unknown,
      attempts: 1,
      lastErrorCode: 'ambiguous_outcome',
      nextRetryAt: null,
    });
  });

  it('does not retry a partial acceptance and retains its non-sensitive provider receipt', async () => {
    const { prisma, records } = createPrisma();
    const send = jest.fn(async () =>
      acceptedReceipt({
        acceptedRecipientCount: 1,
        rejectedRecipientCount: 1,
        failureKind: 'recipient',
      }),
    );

    await expect(
      deliverNotificationEmail(prisma, { send } as unknown as MailTransport, configuration, input),
    ).rejects.toBeInstanceOf(NotificationEmailOutcomeUnknownError);

    expect([...records.values()][0]).toMatchObject({
      status: emailDeliveryStatuses.unknown,
      lastErrorCode: 'partial_acceptance',
      providerMessageId: '<provider-message-1@example.test>',
      providerResponseCode: 250,
    });
  });

  it('marks a classified permanent rejection DEAD and returns only a safe queue error', async () => {
    const { prisma, records } = createPrisma();
    const send = jest.fn(async () =>
      acceptedReceipt({
        acceptedRecipientCount: 0,
        rejectedRecipientCount: 1,
        messageId: null,
        responseCode: 550,
        failureKind: 'recipient',
      }),
    );

    const result = deliverNotificationEmail(prisma, { send } as unknown as MailTransport, configuration, input);
    await expect(result).rejects.toMatchObject({
      code: 'EENVELOPE',
      responseCode: 550,
      response: '550 recipient address rejected',
    });
    expect([...records.values()][0]).toMatchObject({
      status: emailDeliveryStatuses.dead,
      lastErrorCode: 'recipient',
      lastErrorResponseCode: 550,
    });
  });

  it('preserves a stale CLAIMED row as UNKNOWN instead of taking it over', async () => {
    const { prisma, records } = createPrisma();
    const staleAt = new Date(Date.now() - notificationEmailClaimStaleAfterMs - 60_000);
    records.set('delivery-stale', {
      id: 'delivery-stale',
      ...input,
      status: emailDeliveryStatuses.claimed,
      attempts: 1,
      lastAttemptAt: staleAt,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorResponseCode: null,
      providerMessageId: null,
      providerResponseCode: null,
      providerAcceptedAt: null,
      createdAt: staleAt,
      updatedAt: staleAt,
    });
    const send = jest.fn(async () => acceptedReceipt());

    await expect(
      deliverNotificationEmail(prisma, { send } as unknown as MailTransport, configuration, input),
    ).rejects.toBeInstanceOf(NotificationEmailOutcomeUnknownError);

    const row = records.get('delivery-stale');
    expect(row).toMatchObject({
      status: emailDeliveryStatuses.unknown,
      lastErrorCode: 'stale_claim',
      nextRetryAt: null,
    });
    expect(row?.updatedAt.getTime()).toBeGreaterThan(staleAt.getTime());
    expect(send).not.toHaveBeenCalled();
  });
});
