import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { notificationTypes } from '../notifications/notifications.constants';
import { OnCallService } from './on-call.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));

describe('OnCallService.notify notification preferences (BA-notifications-04)', () => {
  function createService(options: {
    readonly getSetting?: (key: string) => Promise<unknown>;
    readonly preferenceRows?: readonly { userId: string; inApp: boolean | null; email: string | null }[];
    readonly failPreferenceRead?: boolean;
    readonly includePreferenceDelegate?: boolean;
  } = {}) {
    const created: unknown[] = [];
    const preferenceRead = jest.fn(async () => {
      if (options.failPreferenceRead) throw new Error('sensitive preference read failure');
      return [...(options.preferenceRows ?? [])];
    });
    const prisma: Record<string, unknown> = {
      user: {
        findUnique: jest.fn(async () => ({
          preferredLocale: 'bs',
          isActive: true,
          anonymizedAt: null,
        })),
      },
      notification: {
        create: jest.fn(async ({ data }: { data: unknown }) => {
          created.push(data);
          return { id: 'notification-1', ...(data as object) };
        }),
      },
    };
    if (options.includePreferenceDelegate !== false) {
      prisma.userNotificationPreference = { findMany: preferenceRead };
    }
    const settings = {
      getSetting: options.getSetting ?? (async () => undefined),
    };
    const service = new OnCallService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
    return { service, prisma, created, preferenceRead };
  }

  it('honours OFF for voluntary on-call reminders', async () => {
    const { service, prisma, created, preferenceRead } = createService({
      preferenceRows: [{ userId: 'user-1', inApp: false, email: null }],
    });

    await expect(
      service.notify('user-1', notificationTypes.onCallReminder, 'reminder-1', () => 'Reminder'),
    ).resolves.toBe(false);
    expect(preferenceRead).toHaveBeenCalledWith({
      where: { userId: { in: ['user-1'] }, category: 'oncall.shift' },
      select: { userId: true, inApp: true, email: true },
    });
    expect((prisma.notification as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect(created).toEqual([]);
  });

  it('fails closed when the voluntary on-call preference read fails', async () => {
    const { service, prisma, preferenceRead } = createService({ failPreferenceRead: true });

    await expect(
      service.notify('user-1', notificationTypes.onCallShiftStarted, 'shift-1', () => 'Shift'),
    ).resolves.toBe(false);
    expect(preferenceRead).toHaveBeenCalled();
    expect((prisma.notification as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it('keeps the explicitly mandatory coverage-gap notification independent of optional policy reads', async () => {
    const { service, prisma, preferenceRead, created } = createService({
      getSetting: async () => {
        throw new Error('settings unavailable');
      },
      includePreferenceDelegate: false,
    });

    await expect(
      service.notify('user-1', notificationTypes.onCallGap, 'gap-1', () => 'Coverage gap'),
    ).resolves.toBe(true);
    expect(preferenceRead).not.toHaveBeenCalled();
    expect((prisma.notification as { create: jest.Mock }).create).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
  });
});
