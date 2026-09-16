import { PrismaService } from '../../common/prisma/prisma.service';
import { assertOrganizationalUnitExists } from './assert-organizational-unit-exists';
import { clearFallbackForOrganizationalUnit } from './clear-fallback-for-organizational-unit';
import { generateGroupKey } from './generate-group-key';
import type { CreateGroupInput, GroupResponse } from './groups.types';
import { loadGroupRecord } from './load-group-record';
import { normalizeGroupName } from './normalize-group-name';
import { toGroupResponse } from './to-group-response';

export async function createGroup(
  prisma: PrismaService,
  input: CreateGroupInput,
): Promise<GroupResponse> {
  const name = normalizeGroupName(input.name);
  await assertOrganizationalUnitExists(prisma, input.organizationalUnitId);
  const key = await generateGroupKey(prisma, name);
  const isFallback = input.isFallback ?? false;
  const created = await prisma.$transaction(async (transaction) => {
    if (isFallback) {
      await clearFallbackForOrganizationalUnit(
        transaction as PrismaService,
        input.organizationalUnitId,
      );
    }
    const group = await transaction.group.create({
      data: {
        name,
        key,
        organizationalUnitId: input.organizationalUnitId,
        isFallback,
      },
    });
    return group.id;
  });
  return toGroupResponse(await loadGroupRecord(prisma, created));
}
