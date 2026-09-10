import { PrismaService } from '../../common/prisma/prisma.service';
import { assertDistinguishedNameMatchesParent } from './assert-distinguished-name-matches-parent';
import { assertOrganizationalUnitIdentityIsAvailable } from './assert-organizational-unit-identity-is-available';
import { assertParentChangeIsValid } from './assert-parent-change-is-valid';
import { assertRewrittenDistinguishedNamesAreAvailable } from './assert-rewritten-distinguished-names-are-available';
import { assertRewrittenPathsAreAvailable } from './assert-rewritten-paths-are-available';
import { buildOrganizationalUnitPath } from './build-organizational-unit-path';
import { getOrganizationalUnit } from './get-organizational-unit';
import { loadOrganizationalUnit } from './load-organizational-unit';
import { loadParentOrganizationalUnit } from './load-parent-organizational-unit';
import { normalizeDistinguishedName } from './normalize-distinguished-name';
import { normalizeOptionalOrganizationalUnitAttribute } from './normalize-optional-organizational-unit-attribute';
import { normalizeOrganizationalUnitName } from './normalize-organizational-unit-name';
import type {
  OrganizationalUnitDetailResponse,
  UpdateOrganizationalUnitInput,
} from './organizational-unit.types';
import { rewriteDescendantDistinguishedName } from './rewrite-descendant-distinguished-name';
import { rewriteOrganizationalUnitPath } from './rewrite-organizational-unit-path';
import { throwIfUniqueConstraintViolated } from './throw-if-unique-constraint-violated';

export async function updateOrganizationalUnit(
  prisma: PrismaService,
  organizationalUnitId: string,
  input: UpdateOrganizationalUnitInput,
): Promise<OrganizationalUnitDetailResponse> {
  const current = await loadOrganizationalUnit(prisma, organizationalUnitId);
  const name =
    input.name === undefined
      ? current.name
      : normalizeOrganizationalUnitName(input.name);
  const distinguishedName =
    input.distinguishedName === undefined
      ? current.distinguishedName
      : normalizeDistinguishedName(input.distinguishedName);
  const nextParentId =
    input.parentId === undefined ? current.parentId : input.parentId;
  if (nextParentId !== current.parentId) {
    await assertParentChangeIsValid(prisma, {
      organizationalUnitId,
      nextParentId,
    });
  }
  const parent = await loadParentOrganizationalUnit(prisma, nextParentId);
  assertDistinguishedNameMatchesParent({
    distinguishedName,
    parentDistinguishedName: parent?.distinguishedName ?? null,
  });
  const ouPath = buildOrganizationalUnitPath({
    name,
    parentPath: parent?.ouPath ?? null,
  });
  await assertOrganizationalUnitIdentityIsAvailable(prisma, {
    distinguishedName,
    ouPath,
    excludeId: organizationalUnitId,
  });
  const descendants = await prisma.organizationalUnit.findMany({
    where: { ouPath: { startsWith: `${current.ouPath}/` } },
    select: { id: true, ouPath: true, distinguishedName: true },
  });
  const rewrittenDescendantPaths = descendants.map((descendant) =>
    rewriteOrganizationalUnitPath({
      currentPath: descendant.ouPath,
      oldAncestorPath: current.ouPath,
      newAncestorPath: ouPath,
    }),
  );
  const rewrittenDescendantDistinguishedNames = descendants.map((descendant) =>
    rewriteDescendantDistinguishedName({
      currentDistinguishedName: descendant.distinguishedName,
      oldAncestorDistinguishedName: current.distinguishedName,
      newAncestorDistinguishedName: distinguishedName,
    }),
  );
  const excludedIds = [
    organizationalUnitId,
    ...descendants.map((descendant) => descendant.id),
  ];
  await assertRewrittenPathsAreAvailable(prisma, {
    excludedIds,
    nextPaths: rewrittenDescendantPaths,
  });
  await assertRewrittenDistinguishedNamesAreAvailable(prisma, {
    excludedIds,
    nextDistinguishedNames: rewrittenDescendantDistinguishedNames,
  });
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.organizationalUnit.update({
        where: { id: organizationalUnitId },
        data: {
          name,
          type: input.type ?? current.type,
          distinguishedName,
          ouPath,
          parentId: parent?.id ?? null,
          company:
            input.company === undefined
              ? current.company
              : normalizeOptionalOrganizationalUnitAttribute(input.company),
          department:
            input.department === undefined
              ? current.department
              : normalizeOptionalOrganizationalUnitAttribute(input.department),
        },
      });
      for (const [index, descendant] of descendants.entries()) {
        await transaction.organizationalUnit.update({
          where: { id: descendant.id },
          data: {
            ouPath: rewrittenDescendantPaths[index],
            distinguishedName: rewrittenDescendantDistinguishedNames[index],
          },
        });
      }
    });
  } catch (error) {
    throwIfUniqueConstraintViolated(error);
    throw error;
  }
  return getOrganizationalUnit(prisma, organizationalUnitId);
}
