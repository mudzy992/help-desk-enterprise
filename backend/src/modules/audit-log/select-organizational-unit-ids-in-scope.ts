import { doesOrganizationalUnitScopeCover } from '../authorization/does-organizational-unit-scope-cover';

export function selectOrganizationalUnitIdsInScope(
  units: readonly { readonly id: string; readonly ouPath: string }[],
  requestedPath: string,
): readonly string[] {
  return units
    .filter((unit) =>
      doesOrganizationalUnitScopeCover({
        assignedPath: requestedPath,
        requestedPath: unit.ouPath,
      }),
    )
    .map((unit) => unit.id);
}

export function isAuditLogVisibleInOrganizationalUnitScope(input: {
  readonly recordOrganizationalUnitId: string | null;
  readonly scopedOrganizationalUnitIds: readonly string[];
  readonly includeGlobalRecords: boolean;
}): boolean {
  if (input.recordOrganizationalUnitId === null) {
    return input.includeGlobalRecords;
  }
  return input.scopedOrganizationalUnitIds.includes(
    input.recordOrganizationalUnitId,
  );
}
