export type GroupUnitReference = {
  readonly id: string;
  readonly organizationalUnitId: string;
  readonly organizationalUnitPath: string;
  readonly name: string;
};

export type GroupUnitSection<T extends GroupUnitReference> = {
  readonly organizationalUnitId: string;
  readonly organizationalUnitPath: string;
  readonly groups: readonly T[];
};

export function groupGroupsByUnit<T extends GroupUnitReference>(
  groups: readonly T[],
): readonly GroupUnitSection<T>[] {
  const sections = new Map<string, GroupUnitSection<T> & { groups: T[] }>();
  for (const group of groups) {
    const existing = sections.get(group.organizationalUnitId);
    if (existing === undefined) {
      sections.set(group.organizationalUnitId, {
        organizationalUnitId: group.organizationalUnitId,
        organizationalUnitPath: group.organizationalUnitPath,
        groups: [group],
      });
      continue;
    }
    existing.groups.push(group);
  }
  return [...sections.values()]
    .map((section) => ({
      ...section,
      groups: [...section.groups].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    }))
    .sort((left, right) =>
      left.organizationalUnitPath.localeCompare(right.organizationalUnitPath),
    );
}
