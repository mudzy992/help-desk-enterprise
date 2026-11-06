import { createHash } from 'node:crypto';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { deliverNotificationEmail } from './deliver-notification-email';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import type { MailTransport } from './mail-transport';

function createPrisma(claimCreates: boolean): {
  prisma: PrismaService;
  updateMany: jest.Mock;
  create: jest.Mock;
} {
  const updateMany = jest.fn(async () => ({ count: 0 }));
  const create = jest.fn(async () => {
    if (!claimCreates) {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    }
    return { id: 'delivery-1' };
  });
  const prisma = {
    notificationEmailDelivery: {
      updateMany,
      create,
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  } as unknown as PrismaService;
  return { prisma, updateMany, create };
}

describe('deliverNotificationEmail (BA-notifications-07)', () => {
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

  it('sends once with a stable Message-ID and marks the row as sent', async () => {
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
        messageId: fallbackMessageId,
      }),
      configuration.smtp,
    );
    // Second updateMany call is the sent marker (first one is the stale-claim check).
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', dedupeKey: 'ticket.resolved:1' },
      data: { status: 'SENT' },
    });
  });

  it('preserves a composer-provided stable Message-ID', async () => {
    const { prisma } = createPrisma(true);
    const send = jest.fn(async () => undefined);

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

  it('does not resend a stale CLAIMED row after an ambiguous SMTP outcome', async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const create = jest.fn(async () => ({ id: 'delivery-1' }));
    const prisma = {
      notificationEmailDelivery: {
        updateMany,
        create,
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
    } as unknown as PrismaService;
    const send = jest.fn(async () => undefined);

    await deliverNotificationEmail(
      prisma,
      { send } as unknown as MailTransport,
      configuration,
      input,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'CLAIMED' }),
        data: expect.objectContaining({ status: 'UNKNOWN' }),
      }),
    );
    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
