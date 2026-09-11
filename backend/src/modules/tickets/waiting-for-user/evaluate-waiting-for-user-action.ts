import { daysToMilliseconds } from '../apply-ticket-lifecycle-timestamps';
import type {
  WaitingForUserAutomationAction,
  WaitingForUserConfiguration,
} from './waiting-for-user.types';

export function evaluateWaitingForUserAction(input: {
  readonly configuration: WaitingForUserConfiguration;
  readonly enteredAt: Date | null;
  readonly reminderSentAt: Date | null;
  readonly now: Date;
}): WaitingForUserAutomationAction {
  if (!input.configuration.enabled || input.enteredAt === null) {
    return 'none';
  }
  const elapsedMs = input.now.getTime() - input.enteredAt.getTime();
  if (elapsedMs < 0) {
    return 'none';
  }
  if (
    elapsedMs >= daysToMilliseconds(input.configuration.autoCloseAfterDays)
  ) {
    return 'auto_close';
  }
  if (
    input.reminderSentAt === null &&
    elapsedMs >= daysToMilliseconds(input.configuration.reminderAfterDays)
  ) {
    return 'remind';
  }
  return 'none';
}
