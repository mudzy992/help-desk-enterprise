import {
  notificationRetentionDaysDefault,
  resolveNotificationRetentionDays,
} from './notification-retention.constants';

describe('resolveNotificationRetentionDays', () => {
  it('falls back to the documented default', () => {
    expect(resolveNotificationRetentionDays(undefined)).toBe(
      notificationRetentionDaysDefault,
    );
    expect(notificationRetentionDaysDefault).toBe(90);
  });

  it('accepts an operator override', () => {
    expect(resolveNotificationRetentionDays('30')).toBe(30);
    expect(resolveNotificationRetentionDays(' 180 ')).toBe(180);
  });

  it('ignores a value that would keep notifications forever', () => {
    expect(resolveNotificationRetentionDays('0')).toBe(
      notificationRetentionDaysDefault,
    );
    expect(resolveNotificationRetentionDays('-5')).toBe(
      notificationRetentionDaysDefault,
    );
    expect(resolveNotificationRetentionDays('forever')).toBe(
      notificationRetentionDaysDefault,
    );
  });
});
