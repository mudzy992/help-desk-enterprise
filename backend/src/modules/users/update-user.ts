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
    select: { id: true, email: true, isLocalOnly: true },
  });
  if (existing === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  const data = await buildUpdateData(prisma, existing, input);
  if (Object.keys(data).length > 0) {
    await prisma.user.update({
      where: { id: input.userId },
      data,
    });
  }
  const summaries = await listUsersSummary(prisma);
  const summary = summaries.find((user) => user.id === input.userId);
  if (summary === undefined) {
    throw new UsersError('USER_NOT_FOUND');
  }
  return summary;
}

async function buildUpdateData(
  prisma: PrismaService,
  existing: { readonly id: string; readonly email: string; readonly isLocalOnly: boolean },
  input: UpdateUserInput,
): Promise<Record<string, string | boolean | null>> {
  const data: Record<string, string | boolean | null> = {};
  if (input.displayName !== undefined) {
    const displayName = input.displayName.trim();
    if (displayName.length === 0) {
      throw new UsersError('INVALID_INPUT');
    }
    data.displayName = displayName;
  }
  if (input.email !== undefined) {
    if (!existing.isLocalOnly) {
      throw new UsersError('INVALID_INPUT');
    }
    const email = input.email.trim().toLowerCase();
    if (email.length === 0) {
      throw new UsersError('INVALID_INPUT');
    }
    if (email !== existing.email) {
      const conflict = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (conflict !== null && conflict.id !== existing.id) {
        throw new UsersError('EMAIL_CONFLICT');
      }
      data.email = email;
    }
  }
  if (input.organizationalUnitId !== undefined) {
    const organizationalUnitId =
      input.organizationalUnitId === null || input.organizationalUnitId.trim() === ''
        ? null
        : input.organizationalUnitId.trim();
    if (organizationalUnitId !== null) {
      const unit = await prisma.organizationalUnit.findUnique({
        where: { id: organizationalUnitId },
        select: { id: true },
      });
      if (unit === null) {
        throw new UsersError('ORGANIZATIONAL_UNIT_NOT_FOUND');
      }
    }
    data.organizationalUnitId = organizationalUnitId;
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }
  return data;
}
