import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { MailTransport } from '../notifications/email/mail-transport';
import type { SettingsService } from '../settings/settings.service';
import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';
import { listUsersSummary } from './list-users-summary';
import type { ResetUserPasswordResponse, UserAuditContext } from './users.types';
import { recordUserChange } from './record-user-change';
import { UsersError } from './users.error';

export async function resetUserTemporaryPassword(
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
      organizationalUnitId: true,
    },
  });
  if (existing === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  if (!existing.isLocalOnly) {
    await prisma.$transaction(async (transaction) => {
      await recordUserChange(transaction as unknown as AuditLogWriteClient, {
        action: auditLogActions.userPasswordResetRejected,
        entityId: existing.id,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        organizationalUnitId: existing.organizationalUnitId,
        metadata: {
          reason: 'DIRECTORY_ACCOUNT_NOT_LOCAL',
          isLocalOnly: false,
        },
      });
    });
    throw new UsersError('DIRECTORY_ACCOUNT_NOT_LOCAL');
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
    audit: {
      action: auditLogActions.userPasswordReset,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      organizationalUnitId: existing.organizationalUnitId,
      metadata: {
        reason: 'admin_reset',
        mustChangePassword: true,
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
