import type { PrismaService } from '../../common/prisma/prisma.service';
import type { MailTransport } from '../notifications/email/mail-transport';
import type { SettingsService } from '../settings/settings.service';
import { assignUserRole } from './assign-user-role';
import { ensureSystemRole } from './ensure-system-role';
import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';
import { listUsersSummary } from './list-users-summary';
import type { CreateUserInput, CreateUserResponse } from './users.types';
import { UsersError } from './users.error';

export async function createUser(
  prisma: PrismaService,
  input: CreateUserInput,
  dependencies: {
    readonly settingsService: SettingsService;
    readonly mailTransport: MailTransport;
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
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing !== null) {
    throw new UsersError('EMAIL_CONFLICT');
  }
  await ensureSystemRole(prisma, roleKey);
  const created = await prisma.user.create({
    data: {
      displayName,
      email,
      organizationalUnitId,
      isLocalOnly: true,
      isActive: true,
      mustChangePassword: true,
    },
  });
  const issued = await issueTemporaryPasswordForUser({
    prisma,
    settingsService: dependencies.settingsService,
    mailTransport: dependencies.mailTransport,
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
  const summaries = await listUsersSummary(prisma, { ids: [created.id] });
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
