export function extractDirectoryDomainSuffix(
  distinguishedName: string | null | undefined,
): string | null {
  if (distinguishedName === null || distinguishedName === undefined) {
    return null;
  }
  const match = distinguishedName.match(/(?:^|,)(DC=.+)$/i);
  return match?.[1] ?? null;
}

export function buildSuggestedOrganizationalUnitDistinguishedName(input: {
  readonly displayName: string;
  readonly parentDistinguishedName: string | null;
  readonly existingDistinguishedName?: string | null;
  readonly domainSuffix?: string | null;
}): string {
  const name = input.displayName.trim();
  if (name.length === 0) {
    return "";
  }
  if (input.parentDistinguishedName !== null) {
    return `OU=${name},${input.parentDistinguishedName}`;
  }
  const existing = input.existingDistinguishedName?.trim() || null;
  if (existing !== null && existing.length > 0) {
    const commaIndex = existing.indexOf(",");
    if (commaIndex === -1) {
      return `OU=${name}`;
    }
    return `OU=${name}${existing.slice(commaIndex)}`;
  }
  const domain =
    input.domainSuffix?.trim() ||
    extractDirectoryDomainSuffix(existing) ||
    "DC=example,DC=com";
  return `OU=${name},${domain}`;
}
