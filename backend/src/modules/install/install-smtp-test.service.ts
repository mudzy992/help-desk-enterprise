import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import type { MailTransport } from '../notifications/email/mail-transport';
import { TestEmailRateLimiter } from '../notifications/email-templates/test-email-rate-limiter';
import { SettingsService } from '../settings/settings.service';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { installSmtpTestConstants, installSmtpTestErrorCodes } from './install-smtp-test.constants';
import { InstallSmtpTestError } from './install-smtp-test.error';
import type { InstallSmtpTestErrorCode } from './install-smtp-test.error';
import type { InstallSmtpTestResult } from './install-smtp-test.types';
import { mapInstallSmtpTestError } from './map-install-smtp-test-error';
import { readOptionalInstallString } from './read-optional-install-string';
import { readInstallSmtpEnvPrefill } from './read-install-smtp-env-prefill';
import { readInstallSmtpStatus, readStoredInstallSmtp } from './read-install-smtp-status';

/**
 * F4.1: „Pošalji test“ in the SMTP step. The wizard sends through the same mail
 * transport and the same rate limiter class the e-mail templates screen uses
 * (`TestEmailRateLimiter`, 5 sends per 10 minutes) — deliberately the same, so the
 * wizard cannot become a way around that limit. The limiter is created without
 * the Redis client here: the install module must not import the notifications
 * module (module cycle, see `install.module.ts`), so the counter is per-instance.
 */
@Injectable()
export class InstallSmtpTestService {
  private readonly rateLimiter = new TestEmailRateLimiter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  async send(input: {
    readonly toAddress?: string;
  }): Promise<InstallSmtpTestResult> {
    try {
      return await this.sendNow(input);
    } catch (error) {
      throw mapInstallSmtpTestError(error);
    }
  }

  private async sendNow(input: {
    readonly toAddress?: string;
  }): Promise<InstallSmtpTestResult> {
    const superAdmin = await findInstallSuperAdmin(this.prisma);
    if (superAdmin === null) {
      throw new InstallSmtpTestError(
        installSmtpTestErrorCodes.superAdminRequired,
      );
    }
    const status = await readInstallSmtpStatus(
      this.settingsService,
      readInstallSmtpEnvPrefill(),
    );
    if (!status.isConfigured) {
      throw new InstallSmtpTestError(installSmtpTestErrorCodes.notConfigured);
    }
    const toAddress =
      readOptionalInstallString(input.toAddress) ?? superAdmin.email;
    if (!installSmtpTestConstants.addressPattern.test(toAddress)) {
      throw new InstallSmtpTestError(installSmtpTestErrorCodes.invalidRecipient);
    }
    if (!(await this.rateLimiter.consume(superAdmin.id))) {
      throw new InstallSmtpTestError(installSmtpTestErrorCodes.rateLimited);
    }
    const stored = await readStoredInstallSmtp(this.settingsService);
    const env = readInstallSmtpEnvPrefill();
    try {
      await this.mailTransport.send(
        {
          from: status.fromAddress,
          to: toAddress,
          subject: installSmtpTestConstants.subject,
          text: installSmtpTestConstants.body,
          headers: {
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'All',
          },
        },
        {
          host: status.host,
          port: status.port,
          tls: status.tls,
          username: status.username,
          password:
            readOptionalInstallString(stored.password) ?? env.password ?? '',
        },
      );
    } catch (error) {
      // The server's answer („535 Authentication unsuccessful“) is what the
      // operator needs; it never contains the password.
      throw new InstallSmtpTestError(
        classifySendFailure(error),
        error instanceof Error ? error.message : String(error),
      );
    }
    return { isSent: true, toAddress };
  }
}

type SendFailureCode = InstallSmtpTestErrorCode;

/**
 * Server answers are grouped into what the operator can do about them: wrong
 * credentials, wrong encryption, wrong host/port, or a timeout. Anything else
 * keeps the raw message.
 */
export function classifySendFailure(error: unknown): SendFailureCode {
  const code = readErrorField(error, 'code');
  const message = `${String(code)} ${
    error instanceof Error ? error.message : String(error)
  }`.toLowerCase();
  if (code === 'EAUTH' || /auth|535|534|invalid login|credentials/.test(message)) {
    return installSmtpTestErrorCodes.authFailed;
  }
  if (code === 'ETLS' || /tls|ssl|certificate|self.signed/.test(message)) {
    return installSmtpTestErrorCodes.tlsFailed;
  }
  if (code === 'ETIMEDOUT' || /timeout|timed out/.test(message)) {
    return installSmtpTestErrorCodes.timeout;
  }
  if (
    code === 'ECONNECTION' ||
    code === 'ESOCKET' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    /connect|getaddrinfo|enotfound|refused|unreachable/.test(message)
  ) {
    return installSmtpTestErrorCodes.unreachable;
  }
  return installSmtpTestErrorCodes.sendFailed;
}

function readErrorField(error: unknown, field: string): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
}
