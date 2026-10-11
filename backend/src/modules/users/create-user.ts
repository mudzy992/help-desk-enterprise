import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { MailTransport } from '../notifications/email/mail-transport';
import type { SettingsService } from '../settings/settings.service';
import type { HibpPasswordChecker } from '../authentication/security/hibp-password-checker';
import { recordUserChange } from './record-user-change';
import { assignUserRole } from './assign-user-role';
import { ensureSystemRole } from './ensure-system-role';
import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';
import { listUsersSummary } from './list-users-summary';
import { readDisabledPolicyPackKeys } from '../policy-packs/read-disabled-policy-pack-keys';
import type { CreateUserInput, CreateUserResponse } from './users.types';
import { UsersError } from './users.error';

export async function createUser(
  prisma: PrismaService,
  input: CreateUserInput,
  dependencies: {
    readonly settingsService: SettingsService;
    readonly mailTransport: MailTransport;
    /** Paket 5.4.0-d (M5): rejects a compromised temporary password. */
    readonly hibpChecker?: HibpPasswordChecker;
  },
): Promise<CreateUserResponse> {
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const organizationalUnitId = input.organizationalUnitId?.trim() || null;
  const roleKey = input.roleKey.trim();
  if (displayName.length === 0 || email.length === 0) {
    throw new UsersError('INVALID_INPUT');
  }
  if (organizationalUnitId !== null) {
    const unit = await prisma.organizationalUnit.findUnique({
      where: { id: organizationalUnitId },
      select: { id: true },
    });
    if (unit === null) {
      throw new UsersError('ORGANIZATIONAL_UNIT_NOT_FOUND');
    }
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing !== null) {
    throw new UsersError('EMAIL_CONFLICT');
  }
  await ensureSystemRole(prisma, roleKey);
  const created = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        displayName,
        email,
        organizationalUnitId,
        isLocalOnly: true,
        isActive: true,
        mustChangePassword: true,
      },
    });
    await recordUserChange(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.userCreated,
      entityId: user.id,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      organizationalUnitId,
      metadata: {
        after: {
          displayName: user.displayName,
          organizationalUnitId: user.organizationalUnitId,
          isLocalOnly: user.isLocalOnly,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
          roleKey,
        },
      },
    });
    return user;
  });
  const issued = await issueTemporaryPasswordForUser({
    prisma,
    settingsService: dependencies.settingsService,
    mailTransport: dependencies.mailTransport,
    hibpChecker: dependencies.hibpChecker,
    userId: created.id,
    email,
    displayName,
  });
  await assignUserRole(prisma, {
    userId: created.id,
    roleKey,
    organizationalUnitId,
    serviceId: null,
    actorUserId: input.actorUserId,
    actorIsSuperAdmin: input.actorIsSuperAdmin,
    requestId: input.requestId,
  });
  const summaries = await listUsersSummary(prisma, {
    ids: [created.id],
    disabledPolicyPackKeys: await readDisabledPolicyPackKeys(
      dependencies.settingsService,
    ),
  });
  const summary = summaries.find((user) => user.id === created.id);
  if (summary === undefined) {
    throw new UsersError('USER_NOT_FOUND');
  }
  return {
    user: summary,
    temporaryPassword: issued.temporaryPassword,
    temporaryPasswordDelivery: issued.temporaryPasswordDelivery,
  };
}
