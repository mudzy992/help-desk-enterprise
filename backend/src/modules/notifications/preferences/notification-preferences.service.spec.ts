import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import {
  NotificationPreferencesError,
  NotificationPreferencesService,
  validatePreferenceUpdate,
} from './notification-preferences.service';
import { defaultNotificationPreferencePolicy } from './notification-preference-policy';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../email/load-email-channel-configuration', () => ({
  loadEmailChannelConfiguration: jest.fn(async () => ({
    deliveryEnabled: true,
    smtp: { fromAddress: 'helpdesk@example.com' },
  })),
}));
jest.mock('../../teams/read-teams-availability', () => ({
  isTeamsPersonalChannelAvailable: jest.fn(async () => true),
}));

/**
 * M13 (val 4/5): preferences are the only place where a user can switch a
 * notification off, and the administrator's locks must win. Neither the view,
 * the write path (default → null) nor those locks had a service-level spec.
 */
describe('NotificationPreferencesService (M13)', () => {
  type PreferenceRow = {
    category: string;
    inApp: boolean | null;
    email: string | null;
    teams: boolean | null;
  };
  type ScheduleRow = {
    userId: string;
    quietHoursEnabled: boolean;
    quietStartMinute: number;
    quietEndMinute: number;
    quietWeekends: boolean;
    digestMinute: number | null;
    digestWorkdaysOnly: boolean;
  };

  function createService(
    options: {
      readonly preferences?: PreferenceRow[];
      readonly schedule?: ScheduleRow | null;
      readonly pendingItems?: number;
      readonly settingValues?: Record<string, unknown>;
    } = {},
  ) {
    const preferences: PreferenceRow[] = [...(options.preferences ?? [])];
    let schedule: ScheduleRow | null = options.schedule ?? null;
    const upserts: PreferenceRow[] = [];
    const deleted: string[] = [];
    const resetWrites: { preferencesDeleted: number; scheduleUpdates: unknown[] } = {
      preferencesDeleted: 0,
      scheduleUpdates: [],
    };
    const scheduleWrites: unknown[] = [];
    const store: Record<string, unknown> = { ...options.settingValues };

    const userNotificationPreference = {
      findMany: async () => [...preferences],
      upsert: async ({ create }: { create: PreferenceRow }) => {
        upserts.push(create);
        preferences.push(create);
      },
      deleteMany: async ({ where }: { where: { category?: string } }) => {
        if (where.category !== undefined) {
          deleted.push(where.category);
        } else {
          resetWrites.preferencesDeleted += 1;
        }
        return { count: 1 };
      },
    };
    const userNotificationSchedule = {
      findUnique: async () => schedule,
      upsert: async ({ create, update }: { create: unknown; update: unknown }) => {
        scheduleWrites.push({ create, update });
        schedule = { ...(schedule ?? (create as ScheduleRow)) };
      },
      updateMany: async (input: unknown) => {
        resetWrites.scheduleUpdates.push(input);
        return { count: 1 };
      },
    };
    const prisma = {
      userNotificationPreference,
      userNotificationSchedule,
      notificationDigestItem: {
        count: async () => options.pendingItems ?? 0,
      },
      // `update` uses the callback form, `reset` the array form.
      $transaction: async (input: unknown) =>
        typeof input === 'function'
          ? (input as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(input as readonly Promise<unknown>[]),
    } as never;
    const settingsService = {
      getSetting: async (key: string) => store[key],
    } as unknown as SettingsService;
    return {
      service: new NotificationPreferencesService(prisma, settingsService),
      upserts,
      deleted,
      resetWrites,
      scheduleWrites,
      store,
    };
  }

  it('describes every category with its defaults and the next digest slot', async () => {
    const { service } = createService({ pendingItems: 4 });

    const view = await service.view(
      'user-1',
      1,
      new Date('2026-10-05T06:00:00.000Z'),
    );

    const created = view.categories.find((entry) => entry.key === 'ticket.created');
    expect(created).toMatchObject({
      inApp: true,
      inAppLocked: false,
      customized: false,
      channels: { inApp: true, email: true },
    });
    expect(view.policy).toMatchObject({
      preferencesEnabled: true,
      digestEnabled: true,
      emailChannelAvailable: true,
      teamsChannelAvailable: true,
    });
    expect(view.digest).toEqual({
      nextAt: expect.any(String),
      pendingItems: 4,
    });
    expect(view.schedule).toMatchObject({
      quietHoursEnabled: false,
      digestTime: null,
      digestWorkdaysOnly: true,
    });
  });

  it('reports the administrator default when the user has no schedule row', async () => {
    const { store, service } = createService();
    store[settingKeys.privateNotificationsDigestDefaultTime] = '07:15';

    const view = await service.view('user-1', 1, new Date('2026-10-05T05:00:00.000Z'));

    expect(view.policy.digestDefaultTime).toBe('07:15');
    expect(view.schedule.digestTime).toBeNull();
  });

  it('stores a value equal to the default as null, so later default changes apply', async () => {
    const { service, upserts, deleted } = createService();

    await service.update('user-1', 1, {
      preferences: [
        { category: 'ticket.created', inApp: true, email: 'IMMEDIATE' },
      ],
    });

    // Both values equal the defaults → nothing is written and a stale row goes.
    expect(upserts).toEqual([]);
    expect(deleted).toEqual(['ticket.created']);
  });

  it('writes the schedule and only the changed categories', async () => {
    const { service, upserts, scheduleWrites } = createService();

    await service.update('user-1', 1, {
      preferences: [{ category: 'ticket.created', email: 'OFF' }],
      schedule: { quietHoursEnabled: true, digestTime: '08:30' },
    });

    expect(upserts).toEqual([
      expect.objectContaining({ category: 'ticket.created', email: 'OFF' }),
    ]);
    expect(scheduleWrites).toEqual([
      expect.objectContaining({
        update: { quietHoursEnabled: true, digestMinute: 510 },
      }),
    ]);
  });

  it('refuses to write when the administrator switched preferences off', async () => {
    const { service } = createService({
      settingValues: { [settingKeys.privateNotificationsPreferencesEnabled]: false },
    });

    await expect(
      service.update('user-1', 1, { preferences: [] }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_PREFERENCES_DISABLED' });
  });

  it('reports all validation problems at once without writing', async () => {
    const { service, upserts } = createService();

    await expect(
      service.update('user-1', 3, {
        preferences: [
          { category: 'nope', inApp: false },
          { category: 'ticket.message', inApp: false },
          { category: 'ticket.message', inApp: false },
          { category: 'directory.syncAborted', inApp: false },
        ],
        schedule: { quietStart: '10:07' },
      }),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_PREFERENCES_INVALID',
      details: [
        'nope: unknown category',
        'ticket.message: listed twice',
        'directory.syncAborted: always on',
        'schedule.quietStart: expected HH:MM in 15-minute steps',
      ],
    });
    expect(upserts).toEqual([]);
  });

  it('summarises the user’s own settings', async () => {
    const { service } = createService({
      preferences: [
        { category: 'ticket.created', inApp: false, email: null, teams: null },
        { category: 'ticket.message', inApp: null, email: null, teams: null },
      ],
      schedule: {
        userId: 'user-1',
        quietHoursEnabled: true,
        quietStartMinute: 1080,
        quietEndMinute: 420,
        quietWeekends: true,
        digestMinute: 510,
        digestWorkdaysOnly: false,
      },
      pendingItems: 2,
    });

    await expect(service.summary('user-1')).resolves.toEqual({
      customizedCategories: 1,
      quietHours: { start: '18:00', end: '07:00', weekends: true },
      digestTime: '08:30',
      pendingItems: 2,
    });
  });

  it('resets preferences and returns the schedule to the installation defaults', async () => {
    const { service, resetWrites } = createService();

    await service.reset('user-1');

    expect(resetWrites.preferencesDeleted).toBe(1);
    expect(resetWrites.scheduleUpdates).toEqual([
      expect.objectContaining({
        data: {
          quietHoursEnabled: false,
          quietStartMinute: 1080,
          quietEndMinute: 420,
          quietWeekends: false,
          digestMinute: null,
          digestWorkdaysOnly: true,
        },
      }),
    ]);
  });

  describe('validatePreferenceUpdate', () => {
    it('rejects a locked e-mail type and a digest for a report', () => {
      const policy = {
        ...defaultNotificationPreferencePolicy,
        lockedEmail: new Set(['ticket.created']),
      };

      expect(() =>
        validatePreferenceUpdate(
          {
            preferences: [
              { category: 'ticket.created', email: 'OFF' },
              { category: 'report.weeklyTickets', email: 'DIGEST' },
            ],
          },
          2,
          policy,
        ),
      ).toThrow(NotificationPreferencesError);
      try {
        validatePreferenceUpdate(
          {
            preferences: [
              { category: 'ticket.created', email: 'OFF' },
              { category: 'report.weeklyTickets', email: 'DIGEST' },
            ],
          },
          2,
          policy,
        );
      } catch (error) {
        expect((error as NotificationPreferencesError).details).toEqual([
          'ticket.created: e-mail is locked by the administrator',
          'report.weeklyTickets: cannot be delivered in the digest',
        ]);
      }
    });

    it('refuses a category a lower role may not use, and a repeated category', () => {
      expect(() =>
        validatePreferenceUpdate(
          {
            preferences: [
              { category: 'ticket.created', inApp: false },
              { category: 'ticket.message', inApp: false },
              { category: 'ticket.message', inApp: true },
            ],
          },
          0,
          defaultNotificationPreferencePolicy,
        ),
      ).toThrow(NotificationPreferencesError);
      try {
        validatePreferenceUpdate(
          {
            preferences: [
              { category: 'ticket.created', inApp: false },
              { category: 'ticket.message', inApp: false },
              { category: 'ticket.message', inApp: true },
            ],
          },
          0,
          defaultNotificationPreferencePolicy,
        );
      } catch (error) {
        expect((error as NotificationPreferencesError).details).toEqual([
          'ticket.created: not available for your role',
          'ticket.message: listed twice',
        ]);
      }
    });

    it('turns a value equal to the default into null', () => {
      const plan = validatePreferenceUpdate(
        { preferences: [{ category: 'ticket.message', inApp: true, email: 'IMMEDIATE' }] },
        0,
        defaultNotificationPreferencePolicy,
      );
      expect(plan.preferences).toEqual([
        { category: 'ticket.message', inApp: null, email: null, teams: null },
      ]);
    });
  });
});
