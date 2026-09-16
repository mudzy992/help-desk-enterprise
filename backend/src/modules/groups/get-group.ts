import { PrismaService } from '../../common/prisma/prisma.service';
import type { GroupResponse } from './groups.types';
import { loadGroupRecord } from './load-group-record';
import { toGroupResponse } from './to-group-response';

export async function getGroup(
  prisma: PrismaService,
  groupId: string,
): Promise<GroupResponse> {
  const group = await loadGroupRecord(prisma, groupId);
  return toGroupResponse(group);
}
