export type DirectorySyncStatusResponse = {
  readonly enabled: boolean;
  readonly strategy: string;
  readonly maxQueriesPerSecond: number;
  readonly cacheTtlMinutes: number;
  readonly ouTreeCacheTtlHours: number;
  readonly lastSuccessfulReadAt: string | null;
};
