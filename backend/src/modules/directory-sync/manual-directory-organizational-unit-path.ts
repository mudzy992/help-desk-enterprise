import {
  formatDistinguishedName,
  formatDistinguishedNameAttribute,
  parseDistinguishedName,
} from '../../common/ldap/rfc4514-distinguished-name';

/**
 * Sample namespace used only when a manual catalogue row is created with no
 * parent and the caller supplies no DN of its own — the old inline value was
 * `DC=example,DC=com`, and the root builder replaces its first RDN.
 */
export const defaultManualDirectoryCatalogRootDistinguishedName =
  'OU=Users,DC=example,DC=com';

export type ManualDirectoryUnitLink = {
  readonly externalId: string;
  readonly displayName: string;
  readonly parentExternalId: string | null;
  readonly organizationalUnitPath: string;
  readonly distinguishedName: string;
};

export function buildManualDirectoryOrganizationalUnitPath(
  parentPath: string | null,
  displayName: string,
): string {
  return parentPath === null ? `/${displayName}` : `${parentPath}/${displayName}`;
}

/**
 * W2.37 (BA-organizational-units-07): the first RDN is replaced by RDN
 * boundaries through the shared RFC 4514 parser. `indexOf(',')` used to cut
 * inside a value whose own comma was escaped (`OU=Korisnici\, Inc.,DC=local`).
 */
export function rewriteManualDirectoryRootDistinguishedName(
  existingDistinguishedName: string,
  displayName: string,
): string {
  const prefix = formatDistinguishedNameAttribute('OU', displayName);
  const relatives = parseDistinguishedName(existingDistinguishedName);
  if (relatives.length <= 1) {
    return prefix;
  }
  return `${prefix},${formatDistinguishedName(relatives.slice(1))}`;
}

export function buildManualDirectoryOrganizationalUnitDistinguishedName(
  parentDistinguishedName: string | null,
  displayName: string,
  fallbackDistinguishedName: string,
): string {
  if (parentDistinguishedName === null) {
    return rewriteManualDirectoryRootDistinguishedName(
      fallbackDistinguishedName,
      displayName,
    );
  }
  return `${formatDistinguishedNameAttribute('OU', displayName)},${parentDistinguishedName}`;
}

export function isCircularManualDirectoryParent(input: {
  readonly externalId: string;
  readonly nextParentExternalId: string | null;
  readonly parentExternalIdByExternalId: ReadonlyMap<string, string | null>;
}): boolean {
  if (input.nextParentExternalId === null) {
    return false;
  }
  if (input.nextParentExternalId === input.externalId) {
    return true;
  }
  let cursor: string | null = input.nextParentExternalId;
  const visited = new Set<string>();
  while (cursor !== null) {
    if (cursor === input.externalId || visited.has(cursor)) {
      return true;
    }
    visited.add(cursor);
    cursor = input.parentExternalIdByExternalId.get(cursor) ?? null;
  }
  return false;
}

export function listManualDirectoryDescendantsTopDown(
  rootExternalId: string,
  units: readonly ManualDirectoryUnitLink[],
): ManualDirectoryUnitLink[] {
  const childrenByParent = new Map<string, ManualDirectoryUnitLink[]>();
  for (const unit of units) {
    if (unit.parentExternalId === null) {
      continue;
    }
    const siblings = childrenByParent.get(unit.parentExternalId) ?? [];
    siblings.push(unit);
    childrenByParent.set(unit.parentExternalId, siblings);
  }
  const ordered: ManualDirectoryUnitLink[] = [];
  const queue = [...(childrenByParent.get(rootExternalId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    ordered.push(current);
    queue.push(...(childrenByParent.get(current.externalId) ?? []));
  }
  return ordered;
}