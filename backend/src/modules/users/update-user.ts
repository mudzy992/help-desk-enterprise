import type { PrismaService } from '../../common/prisma/prisma.service';
import type { UpdateUserInput, UserSummaryResponse } from './users.types';
import { UsersError } from './users.error';
import { listUsersSummary } from './list-users-summary';

export async function updateUser(
  prisma: PrismaService,
  input: UpdateUserInput,
): Promise<UserSummaryResponse> {
  const existing = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });
  if (existing === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  if (input.isActive !== undefined) {
    await prisma.user.update({
      where: { id: input.userId },
      data: { isActive: input.isActive },
    });
  }
  const summaries = await listUsersSummary(prisma);
  const summary = summaries.find((user) => user.id === input.userId);
  if (summary === undefined) {
    throw new UsersError('USER_NOT_FOUND');
  }
  return summary;
}
