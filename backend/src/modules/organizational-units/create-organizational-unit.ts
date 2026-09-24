import { invalidateOrganizationalUnitScopeCache } from '../../common/cache/scope-catalog-cache';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertDistinguishedNameMatchesParent } from './assert-distinguished-name-matches-parent';
import { assertOrganizationalUnitIdentityIsAvailable } from './assert-organizational-unit-identity-is-available';
import { buildOrganizationalUnitPath } from './build-organizational-unit-path';
import { loadParentOrganizationalUnit } from './load-parent-organizational-unit';
import { normalizeDistinguishedName } from './normalize-distinguished-name';
import { normalizeOptionalOrganizationalUnitAttribute } from './normalize-optional-organizational-unit-attribute';
import { normalizeOrganizationalUnitName } from './normalize-organizational-unit-name';
import type {
  CreateOrganizationalUnitInput,
  OrganizationalUnitDetailResponse,
} from './organizational-unit.types';
import { throwIfUniqueConstraintViolated } from './throw-if-unique-constraint-violated';
import { toOrganizationalUnitResponse } from './to-organizational-unit-response';

export async function createOrganizationalUnit(
  prisma: PrismaService,
  input: CreateOrganizationalUnitInput,
): Promise<OrganizationalUnitDetailResponse> {
  const name = normalizeOrganizationalUnitName(input.name);
  const distinguishedName = normalizeDistinguishedName(input.distinguishedName);
  const parent = await loadParentOrganizationalUnit(prisma, input.parentId);
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
  });
  try {
    const created = await prisma.organizationalUnit.create({
      data: {
        name,
        type: input.type,
        distinguishedName,
        ouPath,
        parentId: parent?.id ?? null,
        company: normalizeOptionalOrganizationalUnitAttribute(input.company),
        department: normalizeOptionalOrganizationalUnitAttribute(input.department),
      },
    });
    invalidateOrganizationalUnitScopeCache();
    return {
      ...toOrganizationalUnitResponse(created),
      children: [],
      users: [],
    };
  } catch (error) {
    throwIfUniqueConstraintViolated(error);
    throw error;
  }
}
