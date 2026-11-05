import { PrismaService } from '../../../common/prisma/prisma.service';
import { notificationTypes } from '../notifications.constants';
import { NotificationPreferencePolicyUnavailableError } from '../preferences/notification-preference-policy';
import { persistInAppNotification } from './persist-in-app-notification';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('persistInAppNotification preference guard (BA-notifications-04)', () => {
  function createPrisma() {
    const create = jest.fn(async ({ data }: { data: unknown }) => ({ id: 'notification-1', ...(data as object) }));
    return {
      prisma: { notification: { create } } as unknown as PrismaService,
      create,
    };
  }

  const input = {
    userId: 'user-1',
    title: 'Security update',
    body: 'Account security changed',
    ticketId: null,
    payload: {} as never,
    dedupeKey: 'account-security-1',
  };

  it('allows a catalog category explicitly marked always-on without a policy', async () => {
    const { prisma, create } = createPrisma();

    await expect(
      persistInAppNotification(prisma, { ...input, type: notificationTypes.accountPasswordChanged }),
    ).resolves.toMatchObject({ id: 'notification-1' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects a voluntary category without a policy before writing an inbox row', async () => {
    const { prisma, create } = createPrisma();

    await expect(
      persistInAppNotification(prisma, { ...input, type: notificationTypes.onCallReminder }),
    ).rejects.toBeInstanceOf(NotificationPreferencePolicyUnavailableError);
    expect(create).not.toHaveBeenCalled();
  });
});
