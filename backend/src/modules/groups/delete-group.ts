import { PrismaService } from '../../common/prisma/prisma.service';
import { assertGroupDeletable } from './assert-group-deletable';
import { loadGroupRecord } from './load-group-record';

export async function deleteGroup(
  prisma: PrismaService,
  groupId: string,
): Promise<void> {
  const group = await loadGroupRecord(prisma, groupId);
  await assertGroupDeletable(prisma, group);
  await prisma.group.delete({ where: { id: groupId } });
}
