export const configVersionStatuses = {
  draft: "DRAFT",
  validated: "VALIDATED",
  shadow: "SHADOW",
  active: "ACTIVE",
  rolledBack: "ROLLED_BACK",
} as const;

export type ConfigVersionStatus =
  (typeof configVersionStatuses)[keyof typeof configVersionStatuses];

export const configVersionStatusValues: readonly ConfigVersionStatus[] = [
  configVersionStatuses.draft,
  configVersionStatuses.validated,
  configVersionStatuses.shadow,
  configVersionStatuses.active,
  configVersionStatuses.rolledBack,
];

export type ConfigVersion = {
  readonly id: string;
  readonly version: number;
  readonly status: ConfigVersionStatus;
  readonly releaseNotes: string | null;
  readonly createdByUserId: string | null;
  readonly activatedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rollbackOfVersion: number | null;
};

export type ConfigValidationIssue = {
  readonly code: string;
  readonly path: string;
  readonly message: string;
};

export type ConfigValidationResult = {
  readonly valid: boolean;
  readonly errors: readonly ConfigValidationIssue[];
};

export type ConfigVersionDiffChange = {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
};

export type ConfigVersionDiff = {
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly changes: readonly ConfigVersionDiffChange[];
};
