export type UnroutedQueueConfiguration = {
  readonly enabled: boolean;
  readonly ownerRole: string;
  readonly targetGroupId: string | null;
  readonly cleanupSlaHours: number;
  readonly weeklyDigest: boolean;
};

export const defaultUnroutedQueueConfiguration: UnroutedQueueConfiguration = {
  enabled: true,
  ownerRole: 'SUPER_ADMIN',
  targetGroupId: null,
  cleanupSlaHours: 8,
  weeklyDigest: true,
};
