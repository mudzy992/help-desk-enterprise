import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { MailTransport } from '../notifications/email/mail-transport';
import type { SettingsService } from '../settings/settings.service';
import type { HibpPasswordChecker } from '../authentication/security/hibp-password-checker';
import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';
import { listUsersSummary } from './list-users-summary';
import type { ResetUserPasswordResponse, UserAuditContext } from './users.types';
import { UsersError } from './users.error';
import type {
  AccountSecurityBoundaryPort,
  AccountSecurityCut,
} from '../authentication/security/account-security-boundary.service';

export async function unlinkUserDirectoryIdentity(
  prisma: PrismaService,
  userId: string,
  dependencies: {
    readonly settingsService: SettingsService;
    readonly mailTransport: MailTransport;
    /** Paket 5.4.0-d (M5): rejects a compromised temporary password. */
    readonly hibpChecker?: HibpPasswordChecker;
    readonly invalidatePrincipal?: (userId: string) => Promise<unknown>;
    /**
     * W2.22 (`BA-users-03`): unlinking hands the account back to the local password
     * world. The directory-era sessions and local factors are cut inside the same
     * transaction that stores the new temporary password.
     */
    readonly securityBoundary?: AccountSecurityBoundaryPort;
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
  let securityCut: AccountSecurityCut | null = null;
  const issued = await issueTemporaryPasswordForUser({
    prisma,
    settingsService: dependencies.settingsService,
    mailTransport: dependencies.mailTransport,
    hibpChecker: dependencies.hibpChecker,
    userId: existing.id,
    email: existing.email,
    displayName: existing.displayName,
    invalidatePrincipal: dependencies.invalidatePrincipal,
    beforePasswordUpdate: async (transaction) => {
      if (dependencies.securityBoundary !== undefined) {
        securityCut = await dependencies.securityBoundary.cutWithinTransaction(transaction, {
          userId: existing.id,
          actorUserId: context.actorUserId,
          transition: 'directory_unlinked',
        });
      }
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
  if (securityCut !== null) {
    await dependencies.securityBoundary?.afterCommit({
      userId: existing.id,
      actorUserId: context.actorUserId,
      cut: securityCut,
    });
  }
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
