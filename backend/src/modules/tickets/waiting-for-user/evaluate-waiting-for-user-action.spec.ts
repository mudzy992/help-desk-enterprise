import { evaluateWaitingForUserAction } from './evaluate-waiting-for-user-action';
import { defaultWaitingForUserConfiguration } from './waiting-for-user.constants';

const enteredAt = new Date('2026-09-01T12:00:00.000Z');

describe('evaluateWaitingForUserAction', () => {
  it('returns none when disabled or still inside the reminder window', () => {
    expect(
      evaluateWaitingForUserAction({
        configuration: { ...defaultWaitingForUserConfiguration, enabled: false },
        enteredAt,
        reminderSentAt: null,
        now: new Date('2026-09-10T12:00:00.000Z'),
      }),
    ).toBe('none');
    expect(
      evaluateWaitingForUserAction({
        configuration: defaultWaitingForUserConfiguration,
        enteredAt,
        reminderSentAt: null,
        now: new Date('2026-09-02T11:59:59.000Z'),
      }),
    ).toBe('none');
  });

  it('reminds once then auto-closes after the configured windows', () => {
    expect(
      evaluateWaitingForUserAction({
        configuration: defaultWaitingForUserConfiguration,
        enteredAt,
        reminderSentAt: null,
        now: new Date('2026-09-03T12:00:00.000Z'),
      }),
    ).toBe('remind');
    expect(
      evaluateWaitingForUserAction({
        configuration: defaultWaitingForUserConfiguration,
        enteredAt,
        reminderSentAt: new Date('2026-09-03T12:00:00.000Z'),
        now: new Date('2026-09-04T12:00:00.000Z'),
      }),
    ).toBe('none');
    expect(
      evaluateWaitingForUserAction({
        configuration: defaultWaitingForUserConfiguration,
        enteredAt,
        reminderSentAt: new Date('2026-09-03T12:00:00.000Z'),
        now: new Date('2026-09-08T12:00:00.000Z'),
      }),
    ).toBe('auto_close');
  });
});
