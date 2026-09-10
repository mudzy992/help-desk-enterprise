export function normalizeOptionalOrganizationalUnitAttribute(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    return null;
  }
  return normalized;
}
