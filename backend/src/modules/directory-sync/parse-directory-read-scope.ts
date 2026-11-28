import { DirectorySyncError } from './directory-sync.error';
import type {
  DirectoryReadOperation,
  DirectoryReadScopeInput,
  NormalizedDirectoryReadScope,
} from './directory-sync.types';
import { isDirectoryDistinguishedNameWithinBase } from './is-directory-distinguished-name-within-base';
import { isForestRootDistinguishedName } from './is-forest-root-distinguished-name';
import { normalizeDirectoryDistinguishedName } from './normalize-directory-distinguished-name';
import { normalizeDirectoryOrganizationalUnitPath } from './normalize-directory-organizational-unit-path';

export function parseDirectoryReadScope(input: {
  readonly operation: DirectoryReadOperation;
  readonly scope: DirectoryReadScopeInput | undefined;
  readonly usersBaseDistinguishedName: string;
  readonly groupsBaseDistinguishedName: string;
  /**
   * W2.36c: a `manual_catalog` read is a SELECT over rows the same operator can
   * already list; it never touches LDAP. The LDAPS rules — "an OU is required,
   * never the forest root" (RAW §466) — were still applied to it, so a catalogue
   * anchored at `OU=Korisnici,DC=local` could not be read at all and every unit
   * added there stayed out of the tree. The guard still requires a normalized DN;
   * it just stops pretending a local query is a directory browse.
   */
  readonly mode?: 'ldaps' | 'manual_catalog';
}): NormalizedDirectoryReadScope {
  const mode = input.mode ?? 'ldaps';
  const isManualCatalog = mode === 'manual_catalog';
  if (input.scope === undefined || typeof input.scope !== 'object') {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  if (typeof input.scope.includeSubtree !== 'boolean') {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  const distinguishedName = parseOptionalDistinguishedName(
    input.scope.distinguishedName,
    { allowForestRoot: isManualCatalog },
  );
  const organizationalUnitPath = parseOptionalOrganizationalUnitPath(
    input.scope.organizationalUnitPath,
  );
  if (
    distinguishedName === null &&
    organizationalUnitPath === null &&
    !isManualCatalog
  ) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  if (distinguishedName !== null && !isManualCatalog) {
    assertDistinguishedNameIsWithinOperationBase({
      operation: input.operation,
      distinguishedName,
      usersBaseDistinguishedName: input.usersBaseDistinguishedName,
      groupsBaseDistinguishedName: input.groupsBaseDistinguishedName,
    });
  } else if (!isManualCatalog) {
    assertOperationBasesAreConfigured({
      operation: input.operation,
      usersBaseDistinguishedName: input.usersBaseDistinguishedName,
      groupsBaseDistinguishedName: input.groupsBaseDistinguishedName,
    });
  }
  return {
    distinguishedName,
    organizationalUnitPath,
    includeSubtree: input.scope.includeSubtree,
  };
}

function parseOptionalDistinguishedName(
  value: string | undefined,
  options: { readonly allowForestRoot: boolean },
): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  const normalized = normalizeDirectoryDistinguishedName(value);
  if (!options.allowForestRoot && isForestRootDistinguishedName(normalized)) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  return normalized;
}

function parseOptionalOrganizationalUnitPath(
  value: string | undefined,
): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  return normalizeDirectoryOrganizationalUnitPath(value);
}

function assertDistinguishedNameIsWithinOperationBase(input: {
  readonly operation: DirectoryReadOperation;
  readonly distinguishedName: string;
  readonly usersBaseDistinguishedName: string;
  readonly groupsBaseDistinguishedName: string;
}): void {
  const allowedBases = listAllowedBaseDistinguishedNames(input);
  const isWithinAllowedBase = allowedBases.some((baseDistinguishedName) =>
    isDirectoryDistinguishedNameWithinBase({
      distinguishedName: input.distinguishedName,
      baseDistinguishedName,
    }),
  );
  if (!isWithinAllowedBase) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
}

function assertOperationBasesAreConfigured(input: {
  readonly operation: DirectoryReadOperation;
  readonly usersBaseDistinguishedName: string;
  readonly groupsBaseDistinguishedName: string;
}): void {
  if (listAllowedBaseDistinguishedNames(input).length === 0) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
}

function listAllowedBaseDistinguishedNames(input: {
  readonly operation: DirectoryReadOperation;
  readonly usersBaseDistinguishedName: string;
  readonly groupsBaseDistinguishedName: string;
}): readonly string[] {
  const candidates =
    input.operation === 'users'
      ? [input.usersBaseDistinguishedName]
      : input.operation === 'groups'
        ? [input.groupsBaseDistinguishedName]
        : [input.usersBaseDistinguishedName, input.groupsBaseDistinguishedName];
  const allowed: string[] = [];
  for (const candidate of candidates) {
    if (candidate.trim().length === 0) {
      continue;
    }
    const normalized = normalizeDirectoryDistinguishedName(candidate);
    if (isForestRootDistinguishedName(normalized)) {
      throw new DirectorySyncError('INVALID_SCOPE');
    }
    allowed.push(normalized);
  }
  return allowed;
}
