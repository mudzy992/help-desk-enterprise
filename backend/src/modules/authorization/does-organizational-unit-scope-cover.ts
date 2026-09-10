export function isNonEmptyScopeValue(
  value: string | null | undefined,
): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function doesOrganizationalUnitScopeCover(input: {
  readonly assignedPath: string | null;
  readonly requestedPath: string | null;
}): boolean {
  if (
    !isNonEmptyScopeValue(input.assignedPath) ||
    !isNonEmptyScopeValue(input.requestedPath)
  ) {
    return false;
  }
  const assignedPath = input.assignedPath.trim();
  const requestedPath = input.requestedPath.trim();
  if (assignedPath === requestedPath) {
    return true;
  }
  return requestedPath.startsWith(`${assignedPath}/`);
}
