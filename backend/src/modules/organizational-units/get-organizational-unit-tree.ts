import { PrismaService } from '../../common/prisma/prisma.service';
import { assembleOrganizationalUnitTree } from './assemble-organizational-unit-tree';
import { filterOrganizationalUnitTree } from './filter-organizational-unit-tree';
import type {
  OrganizationalUnitRecord,
  OrganizationalUnitTreeNodeResponse,
} from './organizational-unit.types';

/**
 * W2.9: `isVisible` is applied before assembly, so a scoped caller receives its
 * own subtree with the border unit as the root. Without a predicate the whole
 * topology is returned, which stays the behaviour for callers that do not hold
 * `organizationalUnit.manage`.
 */
export async function getOrganizationalUnitTree(
  prisma: PrismaService,
  isVisible?: (record: OrganizationalUnitRecord) => boolean,
): Promise<readonly OrganizationalUnitTreeNodeResponse[]> {
  const records = await prisma.organizationalUnit.findMany({
    orderBy: [{ ouPath: 'asc' }, { name: 'asc' }],
  });
  return assembleOrganizationalUnitTree(
    isVisible === undefined ? records : filterOrganizationalUnitTree(records, isVisible),
  );
}
