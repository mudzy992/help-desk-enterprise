import type { NormalizedDirectoryReadScope } from './directory-sync.types';

export function doesDirectoryEntryMatchScope(input: {
  readonly distinguishedName: string | null;
  readonly organizationalUnitPath: string | null;
  readonly scope: NormalizedDirectoryReadScope;
  readonly matchMode: 'container' | 'member';
}): boolean {
  const matchesDistinguishedName =
    input.scope.distinguishedName === null
      ? true
      : matchesDistinguishedNameScope({
          distinguishedName: input.distinguishedName,
          scopeDistinguishedName: input.scope.distinguishedName,
          includeSubtree: input.scope.includeSubtree,
          matchMode: input.matchMode,
        });
  const matchesOrganizationalUnitPath =
    input.scope.organizationalUnitPath === null
      ? true
      : matchesOrganizationalUnitPathScope({
          organizationalUnitPath: input.organizationalUnitPath,
          scopeOrganizationalUnitPath: input.scope.organizationalUnitPath,
          includeSubtree: input.scope.includeSubtree,
        });
  return matchesDistinguishedName && matchesOrganizationalUnitPath;
}

function matchesDistinguishedNameScope(input: {
  readonly distinguishedName: string | null;
  readonly scopeDistinguishedName: string;
  readonly includeSubtree: boolean;
  readonly matchMode: 'container' | 'member';
}): boolean {
  if (input.distinguishedName === null) {
    return false;
  }
  if (input.matchMode === 'container') {
    if (input.distinguishedName === input.scopeDistinguishedName) {
      return true;
    }
    return (
      input.includeSubtree &&
      input.distinguishedName.endsWith(`,${input.scopeDistinguishedName}`)
    );
  }
  if (!input.distinguishedName.endsWith(`,${input.scopeDistinguishedName}`)) {
    return false;
  }
  if (input.includeSubtree) {
    return true;
  }
  return (
    input.distinguishedName.slice(input.distinguishedName.indexOf(',') + 1) ===
    input.scopeDistinguishedName
  );
}

function matchesOrganizationalUnitPathScope(input: {
  readonly organizationalUnitPath: string | null;
  readonly scopeOrganizationalUnitPath: string;
  readonly includeSubtree: boolean;
}): boolean {
  if (input.organizationalUnitPath === null) {
    return false;
  }
  if (input.organizationalUnitPath === input.scopeOrganizationalUnitPath) {
    return true;
  }
  return (
    input.includeSubtree &&
    input.organizationalUnitPath.startsWith(
      `${input.scopeOrganizationalUnitPath}/`,
    )
  );
}
