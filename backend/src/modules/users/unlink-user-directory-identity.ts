import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { MailTransport } from '../notifications/email/mail-transport';
import type { SettingsService } from '../settings/settings.service';
import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';
import { listUsersSummary } from './list-users-summary';
import type { ResetUserPasswordResponse, UserAuditContext } from './users.types';
import { UsersError } from './users.error';

export async function unlinkUserDirectoryIdentity(
  prisma: PrismaService,
  userId: string,
  dependencies: {
    readonly settingsService: SettingsService;
    readonly mailTransport: MailTransport;
  },
  context: UserAuditContext = { actorUserId: null, requestId: null },
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
      directoryObjectGuid: true,
      organizationalUnitId: true,
    },
  });
  if (existing === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  if (
    existing.isLocalOnly ||
    (existing.entraObjectId === null && existing.directoryObjectGuid === null)
  ) {
    throw new UsersError('INVALID_INPUT');
  }
  if (!existing.isActive) {
    throw new UsersError('INVALID_INPUT');
  }
  const issued = await issueTemporaryPasswordForUser({
    prisma,
    settingsService: dependencies.settingsService,
    mailTransport: dependencies.mailTransport,
    userId: existing.id,
    email: existing.email,
    displayName: existing.displayName,
    beforePasswordUpdate: async (transaction) => {
      await transaction.user.update({
        where: { id: existing.id },
        data: {
          entraObjectId: null,
          directoryObjectGuid: null,
          distinguishedName: null,
        },
      });
    },
    audit: {
      action: auditLogActions.userDirectoryUnlinked,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      organizationalUnitId: existing.organizationalUnitId,
      metadata: {
        directoryKind: existing.directoryObjectGuid === null ? 'entra' : 'ldaps',
        before: { directoryLinked: true, isLocalOnly: false },
        after: { directoryLinked: false, isLocalOnly: true, mustChangePassword: true },
      },
    },
  });
  const summaries = await listUsersSummary(prisma, { ids: [existing.id] });
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
