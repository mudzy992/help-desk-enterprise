export type WaitingForUserConfiguration = {
  readonly enabled: boolean;
  readonly reminderAfterDays: number;
  readonly autoCloseAfterDays: number;
};

export type WaitingForUserAutomationAction = 'none' | 'remind' | 'auto_close';
