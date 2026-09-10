import type {
  OrganizationalUnitRecord,
  OrganizationalUnitTreeNodeResponse,
} from './organizational-unit.types';
import { toOrganizationalUnitResponse } from './to-organizational-unit-response';

export function assembleOrganizationalUnitTree(
  records: readonly OrganizationalUnitRecord[],
): OrganizationalUnitTreeNodeResponse[] {
  const childrenByParentId = new Map<string | null, OrganizationalUnitRecord[]>();
  for (const record of records) {
    const siblings = childrenByParentId.get(record.parentId) ?? [];
    siblings.push(record);
    childrenByParentId.set(record.parentId, siblings);
  }
  return buildLevel(null, childrenByParentId);
}

function buildLevel(
  parentId: string | null,
  childrenByParentId: ReadonlyMap<string | null, OrganizationalUnitRecord[]>,
): OrganizationalUnitTreeNodeResponse[] {
  const siblings = childrenByParentId.get(parentId) ?? [];
  return siblings.map((record) => ({
    ...toOrganizationalUnitResponse(record),
    children: buildLevel(record.id, childrenByParentId),
  }));
}
