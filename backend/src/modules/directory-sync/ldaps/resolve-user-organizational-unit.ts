import {
  isDistinguishedNameWithin,
  organizationalUnitPathFromDistinguishedName,
} from './distinguished-name';
import type {
  LdapsDirectoryUserEntry,
  OrganizationalUnitMappingOverride,
} from './ldaps-directory.types';

export type OrganizationalUnitCandidate = {
  readonly path: string;
  readonly company: string | null;
  readonly department: string | null;
};

export type ResolvedOrganizationalUnit =
  | { readonly path: string; readonly via: 'override' | 'dn_path' | 'company_department' }
  | { readonly path: null; readonly via: 'none' };

/**
 * Paket 1.8 (A3, RAW §903): places a directory user into an OU. Overrides win,
 * then the configured strategy; `by_company_department` falls back to the DN
 * path, so a missing attribute never leaves an otherwise well-placed user
 * without a unit.
 */
export function resolveUserOrganizationalUnit(input: {
  readonly user: LdapsDirectoryUserEntry;
  readonly strategy: 'by_dn_ou_path' | 'by_company_department';
  readonly overrides: readonly OrganizationalUnitMappingOverride[];
  readonly knownUnits: ReadonlyMap<string, OrganizationalUnitCandidate>;
}): ResolvedOrganizationalUnit {
  for (const override of input.overrides) {
    if (matchesOverride(override, input.user) && input.knownUnits.has(override.ouPath)) {
      return { path: override.ouPath, via: 'override' };
    }
  }
  if (input.strategy === 'by_company_department') {
    const byAttributes = findByCompanyDepartment(input.user, input.knownUnits);
    if (byAttributes !== null) {
      return { path: byAttributes, via: 'company_department' };
    }
  }
  const dnPath = organizationalUnitPathFromDistinguishedName(input.user.distinguishedName);
  if (dnPath !== null && input.knownUnits.has(dnPath)) {
    return { path: dnPath, via: 'dn_path' };
  }
  return { path: null, via: 'none' };
}

function matchesOverride(
  override: OrganizationalUnitMappingOverride,
  user: LdapsDirectoryUserEntry,
): boolean {
  if ('dnSuffix' in override) {
    return isDistinguishedNameWithin(user.distinguishedName, override.dnSuffix);
  }
  if (!equalsIgnoreCase(user.company, override.company)) {
    return false;
  }
  return override.department === undefined || equalsIgnoreCase(user.department, override.department);
}

function findByCompanyDepartment(
  user: LdapsDirectoryUserEntry,
  units: ReadonlyMap<string, OrganizationalUnitCandidate>,
): string | null {
  if (user.company === null) {
    return null;
  }
  let companyOnly: string | null = null;
  for (const unit of units.values()) {
    if (!equalsIgnoreCase(unit.company, user.company)) continue;
    if (user.department !== null && equalsIgnoreCase(unit.department, user.department)) {
      return unit.path;
    }
    if (unit.department === null && companyOnly === null) {
      companyOnly = unit.path;
    }
  }
  return companyOnly;
}

function equalsIgnoreCase(left: string | null | undefined, right: string | null | undefined): boolean {
  return (
    typeof left === 'string' &&
    typeof right === 'string' &&
    left.trim().localeCompare(right.trim(), 'bs', { sensitivity: 'accent' }) === 0
  );
}

/** Parses `private.auth.ouMappingOverridesJson`; invalid entries are dropped. */
export function parseOrganizationalUnitMappingOverrides(
  raw: unknown,
): OrganizationalUnitMappingOverride[] {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const overrides: OrganizationalUnitMappingOverride[] = [];
  for (const item of parsed.slice(0, 500)) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const ouPath = typeof record.ouPath === 'string' ? record.ouPath.trim() : '';
    if (!ouPath.startsWith('/')) continue;
    if (typeof record.dnSuffix === 'string' && record.dnSuffix.trim() !== '') {
      overrides.push({ dnSuffix: record.dnSuffix.trim(), ouPath });
    } else if (typeof record.company === 'string' && record.company.trim() !== '') {
      overrides.push({
        company: record.company.trim(),
        ...(typeof record.department === 'string' && record.department.trim() !== ''
          ? { department: record.department.trim() }
          : {}),
        ouPath,
      });
    }
  }
  return overrides;
}
