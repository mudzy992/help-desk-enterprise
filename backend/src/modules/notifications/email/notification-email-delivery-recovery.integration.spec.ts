import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { emailDeliveryStatuses } from './email-template.constants';
import { deliverNotificationEmail } from './deliver-notification-email';
import { NotificationEmailOutcomeUnknownError } from './notification-email-delivery-errors';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import type { MailTransport } from './mail-transport';
import {
  countStuckNotificationEmailDeliveries,
  countUnknownNotificationEmailDeliveries,
  notificationEmailClaimStaleAfterMs,
} from './persist-notification-email-delivery';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('notification e-mail delivery ledger (PostgreSQL integration, BA-notifications-10)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let userId: string;
  const stamp = Date.now();
  const dedupeKey = `crash-recovery:${stamp}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const user = await prisma.user.create({
      data: {
        email: `notification-crash-recovery-${stamp}@example.test`,
        displayName: 'Notification crash recovery',
      },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.notificationEmailDelivery.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.notificationEmailDelivery.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('persists the SMTP provider acceptance evidence in the delivery row', async () => {
    const send = jest.fn(async () => ({
      acceptedRecipientCount: 1,
      rejectedRecipientCount: 0,
      messageId: `<notification-${stamp}@example.test>`,
      responseCode: 250,
      failureKind: null,
    }));
    const transport = { send } as unknown as MailTransport;
    const configuration = {
      smtp: { fromAddress: 'desk@example.test' },
    } as unknown as EmailChannelConfiguration;
    const input = {
      userId,
      toAddress: `notification-crash-recovery-${stamp}@example.test`,
      subject: 'Notification receipt test',
      text: 'Test only',
      templateKey: 'ticket.message',
      dedupeKey,
    };

    await deliverNotificationEmail(prisma as never, transport, configuration, input);

    const row = await prisma.notificationEmailDelivery.findUniqueOrThrow({
      where: { userId_dedupeKey: { userId, dedupeKey } },
    });
    expect(row).toMatchObject({
      status: emailDeliveryStatuses.sent,
      attempts: 1,
      providerMessageId: `<notification-${stamp}@example.test>`,
      providerResponseCode: 250,
      providerAcceptedAt: expect.any(Date),
      nextRetryAt: null,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('records a known pre-acceptance SMTP failure with a retryable classification', async () => {
    const send = jest.fn(async () => {
      throw Object.assign(new Error('SMTP temporary rejection'), {
        command: 'RCPT TO',
        responseCode: 451,
      });
    });
    const transport = { send } as unknown as MailTransport;
    const configuration = {
      smtp: { fromAddress: 'desk@example.test' },
    } as unknown as EmailChannelConfiguration;
    const input = {
      userId,
      toAddress: `notification-crash-recovery-${stamp}@example.test`,
      subject: 'Notification retry test',
      text: 'Test only',
      templateKey: 'ticket.message',
      dedupeKey,
    };

    await expect(
      deliverNotificationEmail(prisma as never, transport, configuration, input),
    ).rejects.toThrow('SMTP temporary rejection');

    const row = await prisma.notificationEmailDelivery.findUniqueOrThrow({
      where: { userId_dedupeKey: { userId, dedupeKey } },
    });
    expect(row).toMatchObject({
      status: emailDeliveryStatuses.failed,
      attempts: 1,
      lastErrorCode: 'transient',
      lastErrorResponseCode: 451,
      nextRetryAt: null,
    });
  });

  it('preserves a stale claim as UNKNOWN and never retries SMTP without operator reconciliation', async () => {
    const staleAt = new Date(Date.now() - notificationEmailClaimStaleAfterMs - 60_000);
    await prisma.notificationEmailDelivery.create({
      data: {
        userId,
        dedupeKey,
        toAddress: `notification-crash-recovery-${stamp}@example.test`,
        templateKey: 'ticket.message',
        status: emailDeliveryStatuses.claimed,
        createdAt: staleAt,
        updatedAt: staleAt,
      },
    });

    const send = jest.fn(async () => undefined);
    const transport = { send } as unknown as MailTransport;
    const configuration = {
      smtp: { fromAddress: 'desk@example.test' },
    } as unknown as EmailChannelConfiguration;
    const input = {
      userId,
      toAddress: `notification-crash-recovery-${stamp}@example.test`,
      subject: 'Notification recovery test',
      text: 'Test only',
      templateKey: 'ticket.message',
      dedupeKey,
      messageId: `<notification-${stamp}@example.test>`,
    };

    await expect(
      deliverNotificationEmail(prisma as never, transport, configuration, input),
    ).rejects.toBeInstanceOf(NotificationEmailOutcomeUnknownError);

    const row = await prisma.notificationEmailDelivery.findUniqueOrThrow({
      where: { userId_dedupeKey: { userId, dedupeKey } },
    });
    expect(row).toMatchObject({ status: emailDeliveryStatuses.unknown });
    expect(row.updatedAt.getTime()).toBeGreaterThan(staleAt.getTime());
    expect(send).not.toHaveBeenCalled();
    await expect(countUnknownNotificationEmailDeliveries(prisma as never)).resolves.toBe(1);
    await expect(countStuckNotificationEmailDeliveries(prisma as never)).resolves.toBe(0);

    // A later queue replay sees the unique UNKNOWN row and remains a no-op.
    await expect(
      deliverNotificationEmail(prisma as never, transport, configuration, input),
    ).rejects.toBeInstanceOf(NotificationEmailOutcomeUnknownError);
    expect(send).not.toHaveBeenCalled();
    await expect(countUnknownNotificationEmailDeliveries(prisma as never)).resolves.toBe(1);
  });
});
