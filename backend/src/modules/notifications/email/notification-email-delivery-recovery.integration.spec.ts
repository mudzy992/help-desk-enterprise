import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { emailDeliveryStatuses } from './email-template.constants';
import { deliverNotificationEmail } from './deliver-notification-email';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import type { MailTransport } from './mail-transport';
import {
  countStuckNotificationEmailDeliveries,
  countUnknownNotificationEmailDeliveries,
  notificationEmailClaimStaleAfterMs,
} from './persist-notification-email-delivery';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('notification e-mail crash recovery (PostgreSQL integration, BA-notifications-07)', () => {
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

    await deliverNotificationEmail(prisma as never, transport, configuration, input);

    const row = await prisma.notificationEmailDelivery.findUniqueOrThrow({
      where: { userId_dedupeKey: { userId, dedupeKey } },
    });
    expect(row).toMatchObject({ status: emailDeliveryStatuses.unknown });
    expect(row.updatedAt.getTime()).toBeGreaterThan(staleAt.getTime());
    expect(send).not.toHaveBeenCalled();
    await expect(countUnknownNotificationEmailDeliveries(prisma as never)).resolves.toBe(1);
    await expect(countStuckNotificationEmailDeliveries(prisma as never)).resolves.toBe(0);

    // A later queue replay sees the unique UNKNOWN row and remains a no-op.
    await deliverNotificationEmail(prisma as never, transport, configuration, input);
    expect(send).not.toHaveBeenCalled();
    await expect(countUnknownNotificationEmailDeliveries(prisma as never)).resolves.toBe(1);
  });
});
