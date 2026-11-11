import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { purgeExpiredNotifications } from './purge-expired-notifications';
import { NotificationRetentionProcessor } from './notification-retention.processor';

jest.mock('./purge-expired-notifications', () => ({
  purgeExpiredNotifications: jest.fn(),
}));

const purgeExpiredNotificationsMock = jest.mocked(purgeExpiredNotifications);

describe('NotificationRetentionProcessor', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  function createProcessor(
    notificationDigestItem: { deleteMany: jest.Mock } | undefined,
  ): {
    processor: NotificationRetentionProcessor;
    deleteMany: jest.Mock;
  } {
    const deleteMany = notificationDigestItem?.deleteMany ?? jest.fn();
    const prisma = {
      notificationDigestItem,
    } as unknown as PrismaService;
    return {
      processor: new NotificationRetentionProcessor(prisma),
      deleteMany,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    purgeExpiredNotificationsMock.mockResolvedValue(7);
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the actual digest retention deletion count after success', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const { processor } = createProcessor({ deleteMany });

    await processor.process();

    expect(deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'notification_digest_items_expired=3 notification_retention_deleted=7',
      ),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs safely and rejects when the digest delete fails so BullMQ can retry', async () => {
    const failure = new Error('database unavailable');
    const deleteMany = jest.fn().mockRejectedValue(failure);
    const { processor } = createProcessor({ deleteMany });

    await expect(processor.process()).rejects.toBe(failure);

    expect(errorSpy).toHaveBeenCalledWith(
      'notification_digest_retention_failed type=Error',
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('rejects instead of reporting zero when the generated digest delegate is missing', async () => {
    const { processor } = createProcessor(undefined);

    await expect(processor.process()).rejects.toThrow(TypeError);

    expect(errorSpy).toHaveBeenCalledWith(
      'notification_digest_retention_failed type=TypeError',
    );
    expect(logSpy).not.toHaveBeenCalled();
  });
});
