import type { OrganizationalUnitRecord } from './organizational-unit.types';

/*
  W2.9 (`BA-organizational-units-01`): the admin tree used to be the whole
  topology for everyone, which told a scoped ADMIN the names and paths of units
  it may not touch. Filtering happens on records, before assembly, so the
  response keeps its shape.

  A visible unit whose parent is not visible becomes a root of the returned
  tree. The alternative — keeping the invisible parent as a stub — would leak
  exactly the node whose name the scope is meant to hide, and would give the
  client a parent it cannot resolve.
*/
export function filterOrganizationalUnitTree(
  records: readonly OrganizationalUnitRecord[],
  isVisible: (record: OrganizationalUnitRecord) => boolean,
): OrganizationalUnitRecord[] {
  const visibleIds = new Set(
    records.filter((record) => isVisible(record)).map((record) => record.id),
  );
  return records
    .filter((record) => visibleIds.has(record.id))
    .map((record) =>
      record.parentId === null || visibleIds.has(record.parentId)
        ? record
        : { ...record, parentId: null },
    );
}
