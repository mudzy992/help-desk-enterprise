import type { PrismaService } from '../../common/prisma/prisma.service';
import type { OrganizationalUnitType } from '../../generated/prisma/enums';
import type { OrganizationalUnitTreeSummaryNode } from './organizational-unit.types';

/**
 * W2.36 (`BA-organizational-units-06`): the tree a caller without
 * `organizationalUnit.manage` gets.
 *
 * The projection is the fix, not a serialization pass: `distinguishedName`,
 * `ouPath`, `company`, `department` and the timestamps are **never read**, so
 * they cannot leak through a later field added to `OrganizationalUnit`. The
 * query keeps `ouPath` only in `orderBy`, where it decides sibling order.
 */
export type OrganizationalUnitTreeSelectionRecord = {
  readonly id: string;
  readonly name: string;
  readonly type: OrganizationalUnitType;
  readonly parentId: string | null;
};

export const organizationalUnitTreeSelectionSelect = {
  id: true,
  name: true,
  type: true,
  parentId: true,
} as const;

export async function getOrganizationalUnitSelectionTree(
  prisma: PrismaService,
): Promise<readonly OrganizationalUnitTreeSummaryNode[]> {
  const records = await prisma.organizationalUnit.findMany({
    orderBy: [{ ouPath: 'asc' }, { name: 'asc' }],
    select: organizationalUnitTreeSelectionSelect,
  });
  return assembleOrganizationalUnitSummaryTree(records);
}

export function assembleOrganizationalUnitSummaryTree(
  records: readonly OrganizationalUnitTreeSelectionRecord[],
): OrganizationalUnitTreeSummaryNode[] {
  const childrenByParentId = new Map<string | null, OrganizationalUnitTreeSelectionRecord[]>();
  for (const record of records) {
    const siblings = childrenByParentId.get(record.parentId) ?? [];
    siblings.push(record);
    childrenByParentId.set(record.parentId, siblings);
  }
  return buildSummaryLevel(null, childrenByParentId);
}

function buildSummaryLevel(
  parentId: string | null,
  childrenByParentId: ReadonlyMap<string | null, OrganizationalUnitTreeSelectionRecord[]>,
): OrganizationalUnitTreeSummaryNode[] {
  const siblings = childrenByParentId.get(parentId) ?? [];
  return siblings.map((record) => ({
    id: record.id,
    name: record.name,
    type: record.type,
    children: buildSummaryLevel(record.id, childrenByParentId),
  }));
}
