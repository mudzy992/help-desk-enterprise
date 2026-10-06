import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { MailTransport } from '../notifications/email/mail-transport';
import type { SettingsService } from '../settings/settings.service';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { JsonValue } from '../change-log/change-log.types';
import { recordUserChange, type UserChangeAction } from './record-user-change';
import { hashLocalPassword } from '../authentication/hash-local-password';
import { generateTemporaryPassword } from './generate-temporary-password';
import { sendTemporaryPasswordEmail } from './send-temporary-password-email';
import type { TemporaryPasswordDelivery } from './users.types';

export type IssuedTemporaryPassword = {
  readonly temporaryPassword: string | null;
  readonly temporaryPasswordDelivery: TemporaryPasswordDelivery;
};

export async function issueTemporaryPasswordForUser(input: {
  readonly prisma: PrismaService;
  readonly settingsService: SettingsService;
  readonly mailTransport: MailTransport;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly beforePasswordUpdate?: (transaction: Prisma.TransactionClient) => Promise<void>;
  readonly audit?: {
    readonly action: UserChangeAction;
    readonly actorUserId: string | null;
    readonly requestId: string | null;
    readonly metadata: JsonValue;
    readonly organizationalUnitId?: string | null;
  };
}): Promise<IssuedTemporaryPassword> {
  const temporaryPassword = generateTemporaryPassword();
  const localPasswordHash = await hashLocalPassword(temporaryPassword);
  await input.prisma.$transaction(async (transaction) => {
    if (input.beforePasswordUpdate !== undefined) {
      await input.beforePasswordUpdate(transaction);
    }
    await transaction.user.update({
      where: { id: input.userId },
      data: {
        localPasswordHash,
        mustChangePassword: true,
        isLocalOnly: true,
      },
    });
    if (input.audit !== undefined) {
      await recordUserChange(transaction as unknown as AuditLogWriteClient, {
        action: input.audit.action,
        entityId: input.userId,
        actorUserId: input.audit.actorUserId,
        requestId: input.audit.requestId,
        metadata: input.audit.metadata,
        organizationalUnitId: input.audit.organizationalUnitId,
      });
    }
  });
  const emailed = await trySendTemporaryPassword({
    settingsService: input.settingsService,
    mailTransport: input.mailTransport,
    toAddress: input.email,
    displayName: input.displayName,
    temporaryPassword,
  });
  return {
    temporaryPassword: emailed ? null : temporaryPassword,
    temporaryPasswordDelivery: emailed ? 'email' : 'ui',
  };
}

async function trySendTemporaryPassword(input: {
  readonly settingsService: SettingsService;
  readonly mailTransport: MailTransport;
  readonly toAddress: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
}): Promise<boolean> {
  try {
    return await sendTemporaryPasswordEmail(input);
  } catch {
    return false;
  }
}
