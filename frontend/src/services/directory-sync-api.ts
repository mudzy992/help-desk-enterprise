import { apiRequest } from "@/services/api";

export type DirectorySyncStatus = {
  readonly enabled: boolean;
  readonly strategy: string;
  readonly maxQueriesPerSecond: number;
  readonly cacheTtlMinutes: number;
  readonly ouTreeCacheTtlHours: number;
  readonly lastSuccessfulReadAt: string | null;
  /** Paket 1.8 */
  readonly source?: "manual_catalog" | "ldaps";
  readonly ldaps?: LdapsSyncStatus | null;
};

export type LdapsSyncStatus = {
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
};

export type ManualDirectoryOrganizationalUnit = {
  readonly id: string;
  readonly externalId: string;
  readonly displayName: string;
  readonly distinguishedName: string;
  readonly organizationalUnitPath: string;
  readonly parentExternalId: string | null;
  readonly type: string;
};

export type DirectoryReadScope = {
  readonly distinguishedName?: string;
  readonly organizationalUnitPath?: string;
  readonly includeSubtree: boolean;
};

export function getDirectorySyncStatus(): Promise<DirectorySyncStatus> {
  return apiRequest("/directory-sync/status");
}

export type DirectoryUserForLinking = {
  readonly externalId: string;
  readonly login: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly distinguishedName: string | null;
  readonly organizationalUnitPath: string | null;
};

export function listDirectoryUsersForLinking(): Promise<
  readonly DirectoryUserForLinking[]
> {
  return apiRequest("/directory-sync/directory-users");
}

export function runDirectorySyncRead(input: {
  readonly operation: "users" | "groups" | "organizational_units";
  readonly scope: DirectoryReadScope;
  readonly forceRefresh?: boolean;
}): Promise<unknown> {
  return apiRequest("/directory-sync/read", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listManualDirectoryOrganizationalUnits(): Promise<
  readonly ManualDirectoryOrganizationalUnit[]
> {
  return apiRequest("/directory-sync/manual-catalog/organizational-units");
}

export function createManualDirectoryOrganizationalUnit(input: {
  readonly displayName: string;
  readonly parentExternalId?: string | null;
  readonly distinguishedName?: string | null;
  readonly type?: string | null;
}): Promise<ManualDirectoryOrganizationalUnit> {
  return apiRequest("/directory-sync/manual-catalog/organizational-units", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateManualDirectoryOrganizationalUnit(
  externalId: string,
  input: {
    readonly displayName?: string;
    readonly parentExternalId?: string | null;
    readonly distinguishedName?: string | null;
    readonly type?: string | null;
  },
): Promise<ManualDirectoryOrganizationalUnit> {
  return apiRequest(
    `/directory-sync/manual-catalog/organizational-units/${encodeURIComponent(externalId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteManualDirectoryOrganizationalUnit(
  externalId: string,
): Promise<void> {
  return apiRequest(
    `/directory-sync/manual-catalog/organizational-units/${encodeURIComponent(externalId)}`,
    { method: "DELETE" },
  );
}

/* ── Paket 1.8: LDAPS full sync ─────────────────────────────────────────── */

export type PlannedUnit = {
  readonly distinguishedName: string;
  readonly path: string;
  readonly name: string;
  readonly type: string;
  readonly parentPath: string | null;
  readonly id?: string;
  readonly changes?: readonly string[];
};

export type PlannedUser = {
  readonly guid: string;
  readonly email: string;
  readonly displayName: string;
  readonly distinguishedName: string;
  readonly company: string | null;
  readonly department: string | null;
  readonly ouPath: string | null;
  readonly userId?: string;
  readonly changes?: readonly string[];
};

export type PlannedDeactivation = {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly reason: "missing" | "disabled";
};

export type PlannedRoleGrant = {
  readonly userId: string | null;
  readonly email: string;
  readonly roleKey: string;
  readonly ouPath: string;
};

export type PlannedRoleRevoke = {
  readonly userRoleId: string;
  readonly userId: string;
  readonly email: string;
  readonly roleKey: string;
};

export type DirectorySyncExceptionItem = {
  readonly code: string;
  readonly distinguishedName: string | null;
  readonly email: string | null;
  readonly detail: string | null;
};

export type DirectorySyncSafeguard = {
  readonly activeManagedUsers: number;
  readonly deactivations: number;
  readonly percent: number;
  readonly limitPercent: number;
  readonly tripped: boolean;
};

export type DirectorySyncPlan = {
  readonly organizationalUnits: {
    readonly create: readonly PlannedUnit[];
    readonly update: readonly PlannedUnit[];
  };
  readonly users: {
    readonly create: readonly PlannedUser[];
    readonly update: readonly PlannedUser[];
    readonly reactivate: readonly PlannedUser[];
    readonly deactivate: readonly PlannedDeactivation[];
    readonly unchanged: number;
  };
  readonly roles: {
    readonly grant: readonly PlannedRoleGrant[];
    readonly revoke: readonly PlannedRoleRevoke[];
  };
  readonly exceptions: readonly DirectorySyncExceptionItem[];
  readonly unitCounts: readonly { readonly path: string; readonly users: number }[];
  readonly safeguard: DirectorySyncSafeguard;
  readonly totals: { readonly directoryUsers: number; readonly directoryUnits: number };
};

export type DirectorySyncPlanSummary = {
  readonly unitsCreated: number;
  readonly unitsUpdated: number;
  readonly usersCreated: number;
  readonly usersUpdated: number;
  readonly usersReactivated: number;
  readonly usersDeactivated: number;
  readonly usersUnchanged: number;
  readonly rolesGranted: number;
  readonly rolesRevoked: number;
  readonly exceptions: number;
  readonly directoryUsers: number;
  readonly directoryUnits: number;
  readonly safeguard: DirectorySyncSafeguard;
};

export type DirectoryTestConnectionResult = {
  readonly runId: string;
  readonly url: string;
  readonly failedUrls: readonly { readonly url: string; readonly code: string }[];
  readonly durationMs: number;
  readonly baseFound: boolean;
  readonly certificate: "system_trust" | "custom_ca";
};

export type DirectoryDryRunResult = {
  readonly runId: string;
  readonly durationMs: number;
  readonly url: string;
  readonly queries: number;
  readonly summary: DirectorySyncPlanSummary;
  readonly plan: DirectorySyncPlan;
  readonly applicableUntil: string;
};

export type DirectoryApplyResult = {
  readonly runId: string;
  readonly dryRunId: string | null;
  readonly durationMs: number;
  readonly result: Record<string, unknown> & {
    readonly failures?: readonly { readonly step: string; readonly email?: string; readonly path?: string }[];
  };
};

export type DirectorySyncRunKind = "TEST_CONNECTION" | "DRY_RUN" | "APPLY" | "SCHEDULED";

export type DirectorySyncRun = {
  readonly id: string;
  readonly kind: DirectorySyncRunKind;
  readonly status: string;
  readonly source: string;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly summary: Partial<DirectorySyncPlanSummary> | null;
  readonly errorCode: string | null;
  readonly appliedByRunId: string | null;
};

export function testDirectoryConnection(): Promise<DirectoryTestConnectionResult> {
  return apiRequest("/directory-sync/test-connection", { method: "POST" });
}

export function runDirectoryDryRun(): Promise<DirectoryDryRunResult> {
  return apiRequest("/directory-sync/dry-run", { method: "POST" });
}

export function applyDirectoryDryRun(dryRunId: string): Promise<DirectoryApplyResult> {
  return apiRequest("/directory-sync/apply", {
    method: "POST",
    body: JSON.stringify({ dryRunId }),
  });
}

export function listDirectorySyncRuns(): Promise<readonly DirectorySyncRun[]> {
  return apiRequest("/directory-sync/runs");
}

export function getDirectorySyncRunPlan(runId: string): Promise<DirectorySyncPlan> {
  return apiRequest(`/directory-sync/runs/${encodeURIComponent(runId)}/plan`);
}
