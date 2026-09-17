import type { PrismaService } from '../../common/prisma/prisma.service';
import type { MailTransport } from '../notifications/email/mail-transport';
import type { SettingsService } from '../settings/settings.service';
import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';
import { listUsersSummary } from './list-users-summary';
import type { ResetUserPasswordResponse } from './users.types';
import { UsersError } from './users.error';

export async function unlinkUserDirectoryIdentity(
  prisma: PrismaService,
  userId: string,
  dependencies: {
    readonly settingsService: SettingsService;
    readonly mailTransport: MailTransport;
  },
): Promise<ResetUserPasswordResponse> {
  const id = userId.trim();
  if (id.length === 0) {
    throw new UsersError('INVALID_INPUT');
  }
  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      displayName: true,
      isActive: true,
      isLocalOnly: true,
      entraObjectId: true,
    },
  });
  if (existing === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  if (existing.isLocalOnly || existing.entraObjectId === null) {
    throw new UsersError('INVALID_INPUT');
  }
  if (!existing.isActive) {
    throw new UsersError('INVALID_INPUT');
  }
  await prisma.user.update({
    where: { id: existing.id },
    data: { entraObjectId: null },
  });
  const issued = await issueTemporaryPasswordForUser({
    prisma,
    settingsService: dependencies.settingsService,
    mailTransport: dependencies.mailTransport,
    userId: existing.id,
    email: existing.email,
    displayName: existing.displayName,
  });
  const summaries = await listUsersSummary(prisma);
  const summary = summaries.find((user) => user.id === existing.id);
  if (summary === undefined) {
    throw new UsersError('USER_NOT_FOUND');
  }
  return {
    user: summary,
    temporaryPassword: issued.temporaryPassword,
    temporaryPasswordDelivery: issued.temporaryPasswordDelivery,
  };
}
