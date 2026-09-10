export type ReadOnlyModeConfiguration = {
  readonly enabled: boolean;
  readonly lockableModuleKeys: readonly string[];
  readonly activeModuleKeys: readonly string[];
  readonly bypassRoleKeys: readonly string[];
};

export type AdminReadOnlyRoute = {
  readonly moduleKey: string;
  readonly isMutation: boolean;
};

export const adminReadOnlyDecisionReasons = {
  notAdminRoute: 'NOT_ADMIN_ROUTE',
  readOperation: 'READ_OPERATION',
  modeDisabled: 'MODE_DISABLED',
  moduleNotActive: 'MODULE_NOT_ACTIVE',
  bypassRole: 'BYPASS_ROLE',
  readOnlyMode: 'READ_ONLY_MODE',
} as const;

export type AdminReadOnlyDecisionReason =
  (typeof adminReadOnlyDecisionReasons)[keyof typeof adminReadOnlyDecisionReasons];

export type AdminReadOnlyDecision = {
  readonly allowed: boolean;
  readonly reason: AdminReadOnlyDecisionReason;
};
