import { PrismaService } from '../../common/prisma/prisma.service';
import { clearFallbackForOrganizationalUnit } from './clear-fallback-for-organizational-unit';
import type { GroupResponse, UpdateGroupInput } from './groups.types';
import { loadGroupRecord } from './load-group-record';
import { normalizeGroupName } from './normalize-group-name';
import { toGroupResponse } from './to-group-response';

export async function updateGroup(
  prisma: PrismaService,
  groupId: string,
  input: UpdateGroupInput,
): Promise<GroupResponse> {
  const current = await loadGroupRecord(prisma, groupId);
  const name =
    input.name === undefined ? current.name : normalizeGroupName(input.name);
  const isFallback =
    input.isFallback === undefined ? current.isFallback : input.isFallback;
  await prisma.$transaction(async (transaction) => {
    if (isFallback && !current.isFallback) {
      await clearFallbackForOrganizationalUnit(
        transaction as PrismaService,
        current.organizationalUnitId,
        groupId,
      );
    }
    await transaction.group.update({
      where: { id: groupId },
      data: { name, isFallback },
    });
  });
  return toGroupResponse(await loadGroupRecord(prisma, groupId));
}
