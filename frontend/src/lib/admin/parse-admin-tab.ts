export const adminTabKeys = ["org", "groups", "users", "permissions", "settings", "ops"] as const;

export type AdminTabKey = (typeof adminTabKeys)[number];

export const defaultAdminTab: AdminTabKey = "org";

export function isAdminTab(value: string | null): value is AdminTabKey {
  return value !== null && (adminTabKeys as readonly string[]).includes(value);
}

export function parseAdminTab(value: string | null): AdminTabKey {
  return isAdminTab(value) ? value : defaultAdminTab;
}

export function buildAdminPath(tab: AdminTabKey, currentSearch = ""): string {
  const query = currentSearch.startsWith("?")
    ? currentSearch.slice(1)
    : currentSearch;
  const params = new URLSearchParams(query);
  params.set("tab", tab);
  return `/admin?${params.toString()}`;
}

export function buildAdminGroupsPath(organizationalUnitId?: string): string {
  const params = new URLSearchParams({ tab: "groups" });
  if (organizationalUnitId !== undefined && organizationalUnitId.length > 0) {
    params.set("ou", organizationalUnitId);
  }
  return `/admin?${params.toString()}`;
}

export function parseAdminGroupsOrganizationalUnitFilter(
  searchParams: URLSearchParams,
): string {
  return searchParams.get("ou") ?? "";
}
