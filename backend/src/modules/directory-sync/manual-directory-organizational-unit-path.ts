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

export function rewriteManualDirectoryRootDistinguishedName(
  existingDistinguishedName: string,
  displayName: string,
): string {
  const commaIndex = existingDistinguishedName.indexOf(',');
  if (commaIndex === -1) {
    return `OU=${displayName}`;
  }
  return `OU=${displayName}${existingDistinguishedName.slice(commaIndex)}`;
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
  return `OU=${displayName},${parentDistinguishedName}`;
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