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
  /** Paket 2.9 (K4): set when created from an imported config package. */
  readonly importedFrom?: {
    readonly sourceEnvironment: string;
    readonly sourceVersion: number;
    readonly exportedAt: string;
    readonly signature: string;
  } | null;
};

export type ConfigPackageReferenceKind =
  | "organizationalUnit"
  | "group"
  | "service"
  | "serviceCategory"
  | "policyPack"
  | "formVersion"
  | "responseTemplate"
  | "playbook"
  | "slaProfile"
  | "calendar";

export type ConfigPackageSignatureState = "valid" | "invalid" | "unsigned" | "no_key";

export type ConfigPackageResolutionItem = {
  readonly kind: ConfigPackageReferenceKind;
  readonly key: string;
  readonly status: "resolved" | "mapped" | "missing" | "ambiguous";
  readonly localId: string | null;
  readonly blocking: boolean;
  readonly usedBy: readonly string[];
};

export type ConfigPackageMappings = Partial<Record<ConfigPackageReferenceKind, Record<string, string>>>;

export type ConfigPackageImportReport = {
  readonly header: {
    readonly appVersion: string;
    readonly sourceEnvironment: string;
    readonly sourceVersion: number;
    readonly exportedAt: string;
    readonly includesEnvironmentBound: boolean;
  };
  readonly candidates: Partial<
    Record<ConfigPackageReferenceKind, readonly { readonly id: string; readonly key: string }[]>
  >;
  readonly checksum: string;
  readonly signature: ConfigPackageSignatureState;
  readonly items: readonly ConfigPackageResolutionItem[];
  readonly settings: {
    readonly applied: readonly string[];
    readonly skippedEnvironmentBound: readonly string[];
    readonly skippedUnknown: readonly string[];
  };
  readonly created: { readonly calendars: readonly string[]; readonly slaProfiles: readonly string[] };
  readonly skipped: Readonly<Record<string, readonly string[]>>;
  readonly blockingCount: number;
  readonly canImport: boolean;
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

export type ConfigShadowDiff = {
  readonly sampleSize: number;
  readonly routingGroupMismatches: number;
  readonly slaRuleMismatches: number;
};
