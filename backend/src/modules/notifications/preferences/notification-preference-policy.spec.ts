import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import {
  defaultNotificationPreferencePolicy,
  loadNotificationPreferencePolicy,
  NotificationPreferencePolicyUnavailableError,
  notificationPreferencePolicyLastKnownGoodTtlMs,
  requireNotificationPreferencePolicyForType,
} from './notification-preference-policy';

describe('notification preference policy loading (BA-notifications-04)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses declared setting defaults for absent overrides and loads a complete policy', async () => {
    const getSetting = jest.fn(async () => undefined);
    const policy = await loadNotificationPreferencePolicy({ getSetting } as unknown as SettingsService);

    expect(getSetting).toHaveBeenCalledTimes(10);
    expect(policy).toMatchObject({
      preferencesEnabled: true,
      digestEnabled: true,
      digestDefaultMinute: 450,
      digestMaxItems: 50,
      quietHoursEnabled: true,
      timeZone: 'Europe/Sarajevo',
    });
    expect(policy.lockedInApp).toEqual(new Set(['ticket.approval', 'ticket.assigned']));
    expect(policy.lockedEmail).toEqual(new Set(['ticket.approval', 'ticket.sla', 'report.weeklyTickets']));
    expect(policy.defaultDigest).toEqual(new Set());
    expect(policy.quietBypass).toEqual(new Set(['ticket.sla']));
  });

  it('fails closed on a rejected setting read when no good snapshot exists', async () => {
    const getSetting = jest.fn(async (key: string) => {
      if (key === settingKeys.privateNotificationsLockedEmailTypesCsv) {
        throw new Error('sensitive database detail');
      }
      return undefined;
    });

    await expect(
      loadNotificationPreferencePolicy({ getSetting } as unknown as SettingsService),
    ).rejects.toBeInstanceOf(NotificationPreferencePolicyUnavailableError);
    await expect(
      loadNotificationPreferencePolicy({ getSetting: undefined } as unknown as SettingsService),
    ).rejects.toBeInstanceOf(NotificationPreferencePolicyUnavailableError);
  });

  it('rejects invalid policy values rather than substituting defaults', async () => {
    const getSetting = jest.fn(async (key: string) =>
      key === settingKeys.privateNotificationsPreferencesEnabled ? 'false' : undefined,
    );

    await expect(
      loadNotificationPreferencePolicy({ getSetting } as unknown as SettingsService),
    ).rejects.toBeInstanceOf(NotificationPreferencePolicyUnavailableError);
  });

  it('uses a per-settings-instance last-known-good snapshot only within five seconds', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-05T12:00:00.000Z'));
    expect(notificationPreferencePolicyLastKnownGoodTtlMs).toBe(5_000);
    let unavailable = false;
    const getSetting = jest.fn(async (key: string) => {
      if (unavailable) throw new Error('database unavailable');
      return key === settingKeys.privateNotificationsPreferencesEnabled ? false : undefined;
    });
    const settings = { getSetting } as unknown as SettingsService;

    const knownGood = await loadNotificationPreferencePolicy(settings);
    expect(knownGood.preferencesEnabled).toBe(false);
    unavailable = true;
    await jest.advanceTimersByTimeAsync(4_000);
    await expect(loadNotificationPreferencePolicy(settings)).resolves.toMatchObject({
      preferencesEnabled: false,
    });
    // Falling back at t+4s must not refresh the original successful timestamp.
    await jest.advanceTimersByTimeAsync(1_001);
    await expect(loadNotificationPreferencePolicy(settings)).rejects.toBeInstanceOf(
      NotificationPreferencePolicyUnavailableError,
    );

    const otherSettings = { getSetting: jest.fn(async () => undefined) } as unknown as SettingsService;
    expect((await loadNotificationPreferencePolicy(otherSettings)).preferencesEnabled).toBe(true);
  });

  it('permits a missing policy only for catalog categories marked always-on', () => {
    expect(requireNotificationPreferencePolicyForType('account.passwordChanged', undefined).alwaysOn).toBe(true);
    expect(requireNotificationPreferencePolicyForType('oncall.gap', undefined).alwaysOn).toBe(true);
    expect(() => requireNotificationPreferencePolicyForType('oncall.reminder', undefined)).toThrow(
      NotificationPreferencePolicyUnavailableError,
    );
    expect(() => requireNotificationPreferencePolicyForType('unknown.notification', defaultNotificationPreferencePolicy)).toThrow(
      NotificationPreferencePolicyUnavailableError,
    );
  });
});
