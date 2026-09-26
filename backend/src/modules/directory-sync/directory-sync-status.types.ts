export type DirectorySyncStatusResponse = {
  readonly enabled: boolean;
  readonly strategy: string;
  readonly maxQueriesPerSecond: number;
  readonly cacheTtlMinutes: number;
  readonly ouTreeCacheTtlHours: number;
  readonly lastSuccessfulReadAt: string | null;
  /** Paket 1.8 */
  readonly source: 'manual_catalog' | 'ldaps';
  readonly ldaps: {
    readonly domainControllers: readonly string[];
    readonly bindConfigured: boolean;
    readonly usersBaseDn: string;
    readonly groupsBaseDn: string;
    readonly customCaCertificate: boolean;
    readonly pageSize: number;
    readonly scheduleCron: string;
    readonly ouMappingStrategy: string;
    readonly ouMappingOverrides: number;
    readonly roleSource: string;
    readonly maxDeactivationPercent: number;
    readonly syncCooldownMinutes: number;
    readonly backoff: { readonly retryAt: string | null; readonly lastErrorCode: string | null };
    readonly missing: readonly string[];
  } | null;
};
