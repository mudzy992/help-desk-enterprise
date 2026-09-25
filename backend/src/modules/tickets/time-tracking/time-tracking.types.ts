export type TimeTrackingConfiguration = {
  readonly idleAutoPauseMinutes: number;
  readonly autoResume: boolean;
  readonly maxSessionHours: number;
  readonly singleActivePerUser: boolean;
  readonly manualEntryEnabled: boolean;
  readonly maxBackdateDays: number;
  readonly manualMaxMinutes: number;
};

export type TimeTrackingConfigurationSource = {
  load(): Promise<TimeTrackingConfiguration>;
};
