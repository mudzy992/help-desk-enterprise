export const defaultWaitingForUserConfiguration = {
  enabled: true,
  reminderAfterDays: 2,
  autoCloseAfterDays: 7,
} as const;

export const waitingForUserAutomationIntervalMs = 15 * 60 * 1000;
