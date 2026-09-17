import { apiRequest } from "@/services/api";

export type DirectorySyncStatus = {
  readonly enabled: boolean;
  readonly strategy: string;
  readonly maxQueriesPerSecond: number;
  readonly cacheTtlMinutes: number;
  readonly ouTreeCacheTtlHours: number;
  readonly lastSuccessfulReadAt: string | null;
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
