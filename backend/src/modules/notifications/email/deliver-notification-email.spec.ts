import type { PrismaService } from '../../../common/prisma/prisma.service';
import { deliverNotificationEmail } from './deliver-notification-email';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import type { MailTransport } from './mail-transport';

function createPrisma(claimCreates: boolean): {
  prisma: PrismaService;
  updateMany: jest.Mock;
} {
  const updateMany = jest.fn(async () => ({ count: 0 }));
  const prisma = {
    notificationEmailDelivery: {
      updateMany,
      create: jest.fn(async () => {
        if (!claimCreates) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        return { id: 'delivery-1' };
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  } as unknown as PrismaService;
  return { prisma, updateMany };
}

describe('deliverNotificationEmail (Val 3, M12/B1)', () => {
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

  it('sends once and marks the row as sent', async () => {
    const { prisma, updateMany } = createPrisma(true);
    const send = jest.fn(async () => undefined);

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
      }),
      configuration.smtp,
    );
    // Second updateMany call is the sent marker (first one is the takeover check).
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', dedupeKey: 'ticket.resolved:1' },
      data: { status: 'SENT' },
    });
  });

  it('does not send when the claim already exists', async () => {
    const { prisma } = createPrisma(false);
    const send = jest.fn(async () => undefined);

    await deliverNotificationEmail(
      prisma,
      { send } as unknown as MailTransport,
      configuration,
      input,
    );

    expect(send).not.toHaveBeenCalled();
  });
});
