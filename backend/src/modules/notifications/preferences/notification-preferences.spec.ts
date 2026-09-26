import { notificationTypes } from '../notifications.constants';
import {
  categoriesForRoleRank,
  configurablePreferenceCategoryKeys,
  findPreferenceCategory,
  findPreferenceCategoryForType,
  highestRoleRank,
  notificationPreferenceCategories,
} from './notification-preference-catalog';
import {
  decideDelivery,
  defaultNotificationPreferencePolicy,
  effectivePreference,
  type NotificationPreferencePolicy,
} from './notification-preference-policy';
import { validatePreferenceUpdate, formatClockMinute } from './notification-preferences.service';
import {
  digestSlotForDay,
  isInQuietHours,
  localParts,
  nextDigestSlot,
  zonedInstant,
} from './notification-schedule-time';
import { planDigestRun } from './plan-digest-run';

jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

const tz = 'Europe/Sarajevo';
const policy = (overrides: Partial<NotificationPreferencePolicy> = {}): NotificationPreferencePolicy => ({
  ...defaultNotificationPreferencePolicy,
  timeZone: tz,
  ...overrides,
});
const entry = (key: string) => {
  const found = findPreferenceCategory(key);
  if (found === null) throw new Error(key);
  return found;
};
const quiet = { quietHoursEnabled: true, quietStartMinute: 18 * 60, quietEndMinute: 7 * 60, quietWeekends: false };

describe('notification preference catalogue', () => {
  it('puts every notification type in exactly one category', () => {
    for (const type of Object.values(notificationTypes)) {
      const matches = notificationPreferenceCategories.filter((category) => category.types.includes(type));
      expect({ type, count: matches.length }).toEqual({ type, count: 1 });
    }
  });

  it('keeps security and the AD safeguard always on and out of admin lists', () => {
    expect(findPreferenceCategoryForType(notificationTypes.accountNewDevice)?.alwaysOn).toBe(true);
    expect(findPreferenceCategoryForType(notificationTypes.directorySyncAborted)?.alwaysOn).toBe(true);
    expect(configurablePreferenceCategoryKeys).not.toContain('account.security');
  });

  it('filters categories by the highest role', () => {
    expect(highestRoleRank(['USER', 'AGENT'])).toBe(1);
    expect(highestRoleRank([], true)).toBe(3);
    const userKeys = categoriesForRoleRank(0).map((category) => category.key);
    expect(userKeys).toContain('ticket.outcome');
    expect(userKeys).not.toContain('ticket.created');
    expect(categoriesForRoleRank(2).map((category) => category.key)).toContain('ticket.unrouted');
  });
});

describe('delivery decisions', () => {
  const now = new Date('2026-09-28T10:00:00Z'); // Monday 12:00 local

  it('defaults to today\'s behaviour', () => {
    expect(decideDelivery({ entry: entry('ticket.created'), policy: policy(), stored: undefined, schedule: undefined, now }))
      .toEqual({ inApp: true, email: 'IMMEDIATE', quiet: false });
  });

  it('applies the stored choice, unless the category is locked', () => {
    const stored = { inApp: false, email: 'OFF' };
    expect(decideDelivery({ entry: entry('ticket.created'), policy: policy(), stored, schedule: undefined, now }))
      .toMatchObject({ inApp: false, email: 'OFF' });
    expect(decideDelivery({ entry: entry('ticket.approval'), policy: policy(), stored, schedule: undefined, now }))
      .toMatchObject({ inApp: true, email: 'IMMEDIATE' });
  });

  it('ignores stored choices while personal preferences are disabled', () => {
    expect(
      effectivePreference(entry('ticket.created'), policy({ preferencesEnabled: false }), { inApp: false, email: 'OFF' }),
    ).toMatchObject({ inApp: true, email: 'IMMEDIATE' });
  });

  it('uses the admin digest default and falls back to immediate when the digest is off', () => {
    const digestDefault = policy({ defaultDigest: new Set(['ticket.created']) });
    expect(effectivePreference(entry('ticket.created'), digestDefault, undefined).email).toBe('DIGEST');
    expect(
      effectivePreference(entry('ticket.created'), { ...digestDefault, digestEnabled: false }, undefined).email,
    ).toBe('IMMEDIATE');
  });

  it('holds immediate e-mail in quiet hours, except locked and bypass categories', () => {
    const night = new Date('2026-09-28T20:00:00Z'); // 22:00 local
    const base = { policy: policy(), stored: undefined, schedule: quiet, now: night };
    expect(decideDelivery({ ...base, entry: entry('ticket.message') })).toMatchObject({ email: 'QUIET', quiet: true });
    expect(decideDelivery({ ...base, entry: entry('ticket.approval') }).email).toBe('IMMEDIATE');
    expect(decideDelivery({ ...base, entry: entry('ticket.sla') }).email).toBe('IMMEDIATE');
  });

  it('always delivers security notifications', () => {
    expect(
      decideDelivery({
        entry: entry('account.security'),
        policy: policy(),
        stored: { inApp: false, email: 'OFF' },
        schedule: quiet,
        now,
      }),
    ).toEqual({ inApp: true, email: 'IMMEDIATE', quiet: false });
  });
});

describe('schedule time (installation zone)', () => {
  it('handles quiet hours across midnight and whole weekends', () => {
    expect(isInQuietHours(quiet, new Date('2026-09-28T16:30:00Z'), tz)).toBe(true); // 18:30
    expect(isInQuietHours(quiet, new Date('2026-09-29T04:30:00Z'), tz)).toBe(true); // 06:30
    expect(isInQuietHours(quiet, new Date('2026-09-29T05:30:00Z'), tz)).toBe(false); // 07:30
    const saturdayNoon = new Date('2026-10-03T10:00:00Z');
    expect(isInQuietHours(quiet, saturdayNoon, tz)).toBe(false);
    expect(isInQuietHours({ ...quiet, quietWeekends: true }, saturdayNoon, tz)).toBe(true);
    expect(isInQuietHours({ ...quiet, quietStartMinute: 600, quietEndMinute: 600 }, saturdayNoon, tz)).toBe(false);
  });

  it('computes wall-clock instants across daylight saving changes', () => {
    // 2026-03-29: clocks go forward (UTC+1 → UTC+2); 2026-10-25: back.
    expect(zonedInstant(tz, 2026, 3, 28, 450).toISOString()).toBe('2026-03-28T06:30:00.000Z');
    expect(zonedInstant(tz, 2026, 3, 30, 450).toISOString()).toBe('2026-03-30T05:30:00.000Z');
    expect(zonedInstant(tz, 2026, 10, 26, 450).toISOString()).toBe('2026-10-26T06:30:00.000Z');
    expect(localParts(new Date('2026-10-25T12:00:00Z'), tz).minuteOfDay).toBe(13 * 60);
  });

  it('skips weekends for workday digests and finds the next slot', () => {
    const saturday = new Date('2026-10-03T09:00:00Z');
    expect(digestSlotForDay(saturday, tz, 450, true)).toBeNull();
    expect(digestSlotForDay(saturday, tz, 450, false)?.toISOString()).toBe('2026-10-03T05:30:00.000Z');
    expect(nextDigestSlot(saturday, tz, 450, true)?.toISOString()).toBe('2026-10-05T05:30:00.000Z');
    expect(formatClockMinute(450)).toBe('07:30');
  });
});

describe('digest run planning', () => {
  const monday0800 = new Date('2026-09-28T06:00:00Z');
  const sunday = new Date('2026-09-27T10:00:00Z');

  it('sends the digest once the slot passed for items older than the slot', () => {
    const plan = planDigestRun({
      policy: policy(),
      schedule: undefined,
      pending: { oldestDigest: sunday, oldestQuiet: null },
      now: monday0800,
    });
    expect(plan).toMatchObject({ kind: 'digest', reasons: ['DIGEST'] });
  });

  it('does not send twice for the same slot, nor items that arrived after it', () => {
    const slot = new Date('2026-09-28T05:30:00Z');
    const schedule = { ...quiet, quietHoursEnabled: false, digestMinute: null, digestWorkdaysOnly: true, lastDigestSentAt: slot };
    expect(
      planDigestRun({ policy: policy(), schedule, pending: { oldestDigest: sunday, oldestQuiet: null }, now: monday0800 }),
    ).toEqual({ kind: 'none' });
    expect(
      planDigestRun({
        policy: policy(),
        schedule: undefined,
        pending: { oldestDigest: new Date('2026-09-28T05:45:00Z'), oldestQuiet: null },
        now: monday0800,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('flushes quiet items after the quiet period, merging with a digest due in 15 minutes', () => {
    const schedule = { ...quiet, digestMinute: 7 * 60 + 15, digestWorkdaysOnly: true, lastDigestSentAt: null };
    const at0705 = new Date('2026-09-28T05:05:00Z');
    expect(
      planDigestRun({ policy: policy(), schedule, pending: { oldestDigest: sunday, oldestQuiet: sunday }, now: at0705 }),
    ).toEqual({ kind: 'none' });
    expect(
      planDigestRun({ policy: policy(), schedule, pending: { oldestDigest: null, oldestQuiet: sunday }, now: at0705 }),
    ).toEqual({ kind: 'quiet', reasons: ['QUIET'] });
    const at0720 = new Date('2026-09-28T05:20:00Z');
    expect(
      planDigestRun({ policy: policy(), schedule, pending: { oldestDigest: sunday, oldestQuiet: sunday }, now: at0720 }),
    ).toMatchObject({ kind: 'digest', reasons: ['DIGEST', 'QUIET'] });
  });

  it('keeps quiet items while still in quiet hours', () => {
    const schedule = { ...quiet, digestMinute: null, digestWorkdaysOnly: true, lastDigestSentAt: null };
    expect(
      planDigestRun({
        policy: policy(),
        schedule,
        pending: { oldestDigest: null, oldestQuiet: sunday },
        now: new Date('2026-09-28T20:00:00Z'),
      }),
    ).toEqual({ kind: 'none' });
  });

  it('sends digest items right away when the digest is switched off', () => {
    expect(
      planDigestRun({
        policy: policy({ digestEnabled: false }),
        schedule: undefined,
        pending: { oldestDigest: new Date('2026-09-28T05:59:00Z'), oldestQuiet: null },
        now: monday0800,
      }).kind,
    ).toBe('digest');
  });
});

describe('preference update validation', () => {
  it('stores defaults as null and rejects locked, foreign and unknown categories at once', () => {
    expect(
      validatePreferenceUpdate(
        {
          preferences: [
            { category: 'ticket.created', inApp: true, email: 'IMMEDIATE' },
            { category: 'ticket.message', inApp: false, email: 'DIGEST' },
          ],
          schedule: { digestTime: '07:30', quietStart: '19:00' },
        },
        1,
        policy(),
      ),
    ).toEqual({
      preferences: [
        { category: 'ticket.created', inApp: null, email: null },
        { category: 'ticket.message', inApp: false, email: 'DIGEST' },
      ],
      schedule: { digestMinute: null, quietStartMinute: 19 * 60 },
    });
    expect(() =>
      validatePreferenceUpdate(
        {
          preferences: [
            { category: 'ticket.approval', email: 'OFF' },
            { category: 'ticket.assigned', inApp: false },
            { category: 'ticket.created', email: 'OFF' },
            { category: 'nope' },
            { category: 'account.security', inApp: false },
          ],
          schedule: { digestTime: '07:20' },
        },
        0,
        policy(),
      ),
    ).toThrow(
      expect.objectContaining({
        details: [
          'ticket.approval: e-mail is locked by the administrator',
          'ticket.assigned: not available for your role',
          'ticket.created: not available for your role',
          'nope: unknown category',
          'account.security: always on',
          'schedule.digestTime: expected HH:MM in 15-minute steps',
        ],
      }),
    );
  });

  it('rejects e-mail for in-app-only categories and quiet hours the admin disabled', () => {
    expect(() =>
      validatePreferenceUpdate(
        { preferences: [{ category: 'ticket.unrouted', email: 'DIGEST' }], schedule: { quietHoursEnabled: true } },
        2,
        policy({ quietHoursEnabled: false }),
      ),
    ).toThrow(
      expect.objectContaining({
        details: [
          'ticket.unrouted: has no e-mail channel',
          'schedule.quietHoursEnabled: quiet hours are disabled by the administrator',
        ],
      }),
    );
  });
});
