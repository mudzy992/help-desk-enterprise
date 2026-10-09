import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticationUserLoader } from '../authentication/authentication-user.loader';
import { mapAccountSecurityError, AccountSecurityError } from '../authentication/security/account-security.error';
import { MfaService } from '../authentication/security/mfa.service';
import {
  assertSecurityRateLimitConfig,
  securityRateLimitBounds,
  SecurityRateLimitConfigError,
  type SecurityRateLimitConfig,
} from '../authentication/security/security-rate-limit-config';
import { SecurityRateLimitConfigLoader } from '../authentication/security/security-rate-limit-config.loader';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { mapSettingsError } from '../settings/map-settings-error';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { IdentityPasskeyService } from './identity-passkey.service';

/*
  Paket 5.4.0-b (M2): reading and retuning the login rate limits. SUPER_ADMIN
  only, with a proof of identity (fresh passkey step-up for this purpose or a
  current TOTP code). The write is one settings batch — one reason, one
  transaction — so the change is versioned and auditable like every other
  settings mutation, and the limiter picks it up on the next request.
*/

export const rateLimitsStepUpPurpose = 'rate-limits-change';

export type SecurityRateLimitsUpdateInput = {
  readonly config: SecurityRateLimitConfig;
  readonly reason: string;
  readonly code?: string;
};

const configKeysByField = {
  accountWindowSeconds: settingKeys.privateSecurityRateLimitsAccountWindowSeconds,
  accountDelayStartsAfterFailures: settingKeys.privateSecurityRateLimitsAccountDelayStartsAfterFailures,
  accountDelayBaseMilliseconds: settingKeys.privateSecurityRateLimitsAccountDelayBaseMilliseconds,
  accountDelayMaxMilliseconds: settingKeys.privateSecurityRateLimitsAccountDelayMaxMilliseconds,
  ipMaxFailures: settingKeys.privateSecurityRateLimitsIpMaxFailures,
  ipWindowSeconds: settingKeys.privateSecurityRateLimitsIpWindowSeconds,
  otherMaxFailures: settingKeys.privateSecurityRateLimitsOtherMaxFailures,
  otherWindowSeconds: settingKeys.privateSecurityRateLimitsOtherWindowSeconds,
} as const;

@Injectable()
export class SecurityRateLimitsService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly configLoader: SecurityRateLimitConfigLoader,
    private readonly mfaService: MfaService,
    private readonly identityPasskeyService: IdentityPasskeyService,
    private readonly userLoader: AuthenticationUserLoader,
    private readonly prisma: PrismaService,
  ) {}

  async current(): Promise<{ config: SecurityRateLimitConfig; bounds: typeof securityRateLimitBounds }> {
    return { config: await this.configLoader.load(), bounds: securityRateLimitBounds };
  }

  async update(
    caller: { readonly subjectId: string; readonly sessionId: string | null },
    input: SecurityRateLimitsUpdateInput,
  ): Promise<{ config: SecurityRateLimitConfig }> {
    let config: SecurityRateLimitConfig;
    try {
      config = assertSecurityRateLimitConfig(input.config);
    } catch (error) {
      if (error instanceof SecurityRateLimitConfigError) {
        throw new BadRequestException({ code: 'RATE_LIMITS_INVALID', message: error.message });
      }
      throw error;
    }

    // Proof of identity: a fresh passkey step-up for this purpose, or a
    // current TOTP code when the account has TOTP enrolled.
    const confirmedByPasskey =
      caller.sessionId !== null
        ? await this.identityPasskeyService.consumeFreshConfirmation(caller.sessionId, rateLimitsStepUpPurpose)
        : false;
    if (!confirmedByPasskey && (await this.mfaService.isEnabled(caller.subjectId))) {
      const subject = await this.userLoader.findById(caller.subjectId);
      if (subject === null) {
        throw new UnauthorizedException({ code: 'USER_NOT_FOUND' });
      }
      await this.mfaService.verify(subject, input.code?.trim() ?? '').catch(mapAccountSecurityError);
    }

    try {
      await this.settingsService.setSettingValues(
        (Object.keys(configKeysByField) as Array<keyof typeof configKeysByField>).map((field) => ({
          key: configKeysByField[field],
          value: config[field],
        })),
        { reason: input.reason, actorUserId: caller.subjectId },
      );
    } catch (error) {
      // The batch is all-or-nothing; a validation problem surfaces as 400.
      if (error instanceof AccountSecurityError) mapAccountSecurityError(error);
      throw mapSettingsError(error);
    }

    await this.audit(caller.subjectId, config);
    return { config: await this.configLoader.load() };
  }

  /** The change is versioned by the settings module; this adds the auth trail. */
  private async audit(actorUserId: string, config: SecurityRateLimitConfig): Promise<void> {
    try {
      await recordAuditEntry(this.prisma, {
        action: auditLogActions.authRateLimitsChanged,
        entityType: 'user',
        entityId: actorUserId,
        actorUserId,
        metadata: {
          ipMaxFailures: config.ipMaxFailures,
          ipWindowSeconds: config.ipWindowSeconds,
          accountDelayStartsAfterFailures: config.accountDelayStartsAfterFailures,
          otherMaxFailures: config.otherMaxFailures,
        } as never,
      });
    } catch {
      // A failed audit write must not roll back a settings change the
      // settings module already journalled with the reason.
    }
  }
}
