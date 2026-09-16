import type { PrismaService } from '../../common/prisma/prisma.service';
import { hashLocalPassword } from '../authentication/hash-local-password';
import type { MailTransport } from '../notifications/email/mail-transport';
import type { SettingsService } from '../settings/settings.service';
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
}): Promise<IssuedTemporaryPassword> {
  const temporaryPassword = generateTemporaryPassword();
  const localPasswordHash = await hashLocalPassword(temporaryPassword);
  await input.prisma.user.update({
    where: { id: input.userId },
    data: {
      localPasswordHash,
      mustChangePassword: true,
      isLocalOnly: true,
    },
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
