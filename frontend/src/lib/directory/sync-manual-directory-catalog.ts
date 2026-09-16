import {
  listManualDirectoryOrganizationalUnits,
  runDirectorySyncRead,
  type ManualDirectoryOrganizationalUnit,
} from "@/services/directory-sync-api";

export async function syncManualDirectoryCatalog(input?: {
  readonly focus?: Pick<
    ManualDirectoryOrganizationalUnit,
    "distinguishedName" | "organizationalUnitPath" | "parentExternalId"
  >;
}): Promise<void> {
  const catalog = await listManualDirectoryOrganizationalUnits();
  const roots =
    input?.focus !== undefined
      ? [input.focus]
      : catalog.filter((unit) => unit.parentExternalId === null);
  const targets =
    roots.length > 0
      ? roots
      : catalog.length > 0
        ? [catalog[0]]
        : [];
  for (const unit of targets) {
    await runDirectorySyncRead({
      operation: "organizational_units",
      scope: {
        distinguishedName: unit.distinguishedName,
        organizationalUnitPath: unit.organizationalUnitPath,
        includeSubtree: true,
      },
      forceRefresh: true,
    });
    await runDirectorySyncRead({
      operation: "users",
      scope: {
        distinguishedName: unit.distinguishedName,
        organizationalUnitPath: unit.organizationalUnitPath,
        includeSubtree: true,
      },
      forceRefresh: true,
    });
  }
  const groupRoots = catalog.filter(
    (unit) =>
      unit.parentExternalId === null &&
      unit.organizationalUnitPath.toLowerCase().includes("group"),
  );
  for (const unit of groupRoots.length > 0 ? groupRoots : targets) {
    await runDirectorySyncRead({
      operation: "groups",
      scope: {
        distinguishedName: unit.distinguishedName,
        organizationalUnitPath: unit.organizationalUnitPath,
        includeSubtree: true,
      },
      forceRefresh: true,
    });
  }
}
