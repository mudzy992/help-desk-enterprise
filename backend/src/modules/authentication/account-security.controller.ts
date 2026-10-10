import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthenticationUserLoader } from './authentication-user.loader';
import type { AuthenticationUserRecord } from './authentication.types';
import {
  type AuthenticatedHttpRequest,
  readAuthenticatedPrincipal,
  readSessionId,
  readSessionJti,
} from './authenticated-request';
import { readSignInContext } from './read-sign-in-context';
import { AccountMfaCodeDto, AccountPasswordChangeDto } from './dto/mfa.dto';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { mfaAttemptKey } from './authentication.service';
import { SessionAuthenticationGuard } from './session-authentication.guard';
import { AccountSecurityError, mapAccountSecurityError } from './security/account-security.error';
import { AccountSecurityPolicyLoader } from './security/account-security-policy.loader';
import { passwordExpiresAt } from './security/account-security-rules';
import { type MfaStatus, MfaService } from './security/mfa.service';
import {
  PasskeyCredentialService,
  type PasskeyView,
} from './security/passkey-credential.service';
import { WebAuthnRpLoader } from './security/webauthn-rp.loader';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { PasskeyRegistrationConfirmDto } from './dto/passkey.dto';
import { PasswordChangeService } from './security/password-change.service';
import { SessionRegistryService, type UserSessionView } from './security/session-registry.service';

export type AccountSecurityOverview = {
  /** The caller the token identifies — pinned by E2E spec 39. */
  readonly principal: { readonly id: string; readonly email: string };
  readonly mfa: MfaStatus;
  readonly password: {
    readonly hasLocalPassword: boolean;
    readonly changedAt: string | null;
    readonly expiresAt: string | null;
    readonly minLength: number;
    readonly blocklistEnabled: boolean;
    readonly historyCount: number;
  };
  /** Paket 5.4.0-a: registered passkeys and whether TOTP is enrolled. */
  readonly passkeys: readonly PasskeyView[];
  readonly hasTotp: boolean;
};

/**
 * Paket 2.1: the signed-in user's own account security ("Moj profil →
 * Sigurnost"). Every endpoint acts on the caller only — no user id in the path.
 */
@Controller('auth')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class AccountSecurityController {
  constructor(
    private readonly userLoader: AuthenticationUserLoader,
    private readonly policyLoader: AccountSecurityPolicyLoader,
    private readonly mfaService: MfaService,
    private readonly passwordChangeService: PasswordChangeService,
    private readonly sessionRegistry: SessionRegistryService,
    private readonly loginAttemptLimiter: LoginAttemptLimiter,
    private readonly passkeyCredentialService: PasskeyCredentialService,
    private readonly webAuthnRpLoader: WebAuthnRpLoader,
  ) {}

  @Get('security')
  async overview(@Req() request: AuthenticatedHttpRequest): Promise<AccountSecurityOverview> {
    const user = await this.caller(request);
    const policy = await this.policyLoader.load();
    const expiresAt = user.localPasswordHash ? passwordExpiresAt(user, policy) : null;
    return {
      principal: { id: user.id, email: user.email },
      mfa: await this.mfaService.status(user, policy),
      password: {
        hasLocalPassword: user.localPasswordHash !== null,
        changedAt: user.passwordChangedAt?.toISOString() ?? null,
        expiresAt: expiresAt?.toISOString() ?? null,
        minLength: policy.passwordMinLength,
        blocklistEnabled: policy.passwordBlocklistEnabled,
        historyCount: policy.passwordHistoryCount,
      },
      passkeys: await this.passkeyCredentialService.listCredentials(user.id),
      hasTotp: await this.mfaService.isEnabled(user.id),
    };
  }

  /**
   * Paket 5.4.0-a (M1): passkey ceremonies on the caller's own account. The
   * TOTP confirm code guards registration when TOTP is already enrolled —
   * a stolen session alone must not be able to add a factor.
   */
  @Post('security/passkey/register/start')
  @HttpCode(200)
  async startPasskeyRegistration(
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<{ options: Record<string, unknown> }> {
    const user = await this.caller(request);
    return this.passkeyCredentialService
      .startRegistration(user, this.webAuthnRpLoader.load())
      .catch(mapAccountSecurityError);
  }

  @Post('security/passkey/register/confirm')
  @HttpCode(200)
  async confirmPasskeyRegistration(
    @Req() request: AuthenticatedHttpRequest,
    @Body() body: PasskeyRegistrationConfirmDto,
  ): Promise<{ passkey: PasskeyView }> {
    const user = await this.caller(request);
    const passkey = await this.loginAttemptLimiter.guard(mfaAttemptKey(user.id), async () => {
      const hasTotp = await this.mfaService.isEnabled(user.id);
      if (hasTotp) {
        // The same limiter bucket as the other MFA confirmations.
        await this.mfaService.verify(user, body.code ?? '').catch(mapAccountSecurityError);
      }
      return this.passkeyCredentialService
        .confirmRegistration(
          user,
          body.response as unknown as RegistrationResponseJSON,
          this.webAuthnRpLoader.load(),
          readSignInContext(request).ipAddress,
        )
        .catch(mapAccountSecurityError);
    });
    return { passkey };
  }

  @Delete('security/passkey/:credentialId')
  @HttpCode(204)
  async removePasskey(
    @Req() request: AuthenticatedHttpRequest,
    @Param('credentialId') credentialId: string,
  ): Promise<void> {
    const user = await this.caller(request);
    const policy = await this.policyLoader.load();
    const hasTotp = await this.mfaService.isEnabled(user.id);
    // The row id (cuid) doubles as the path param; never the WebAuthn id.
    await this.loginAttemptLimiter.guard(mfaAttemptKey(user.id), () =>
      this.passkeyCredentialService
        .removeCredential(user, policy, credentialId, user.id, hasTotp)
        .catch(mapAccountSecurityError),
    );
  }

  /** Own password change; every other session of the caller ends. */
  @Post('password')
  @HttpCode(204)
  async changePassword(@Req() request: AuthenticatedHttpRequest, @Body() body: AccountPasswordChangeDto): Promise<void> {
    const user = await this.caller(request);
    try {
      await this.loginAttemptLimiter.guard(`auth:password-current-fail:${user.id}`, () =>
        this.passwordChangeService.verifyCurrent(user.id, body.currentPassword).catch(mapAccountSecurityError),
      );
      await this.passwordChangeService.assertAcceptable(user.id, user.email, body.newPassword);
      await this.passwordChangeService.apply(user.id, body.newPassword, user.id);
      await this.sessionRegistry.revokeAll({
        userId: user.id,
        reason: 'password_change',
        actorUserId: user.id,
        exceptSessionId: readSessionId(request),
        exceptJti: readSessionJti(request),
      });
    } catch (error) {
      mapAccountSecurityError(error);
    }
  }

  @Get('sessions')
  async sessions(@Req() request: AuthenticatedHttpRequest): Promise<{ items: UserSessionView[] }> {
    const user = await this.caller(request);
    return { items: await this.sessionRegistry.list(user.id, readSessionId(request)) };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  async revokeSession(
    @Req() request: AuthenticatedHttpRequest,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<void> {
    const user = await this.caller(request);
    const revoked = await this.sessionRegistry.revoke({ userId: user.id, sessionId, reason: 'user', actorUserId: user.id });
    if (!revoked) mapAccountSecurityError(new AccountSecurityError('SESSION_NOT_FOUND'));
  }

  @Post('sessions/revoke-others')
  async revokeOtherSessions(@Req() request: AuthenticatedHttpRequest): Promise<{ revoked: number }> {
    const user = await this.caller(request);
    const current = readSessionId(request);
    const revoked = await this.sessionRegistry.revokeAll({
      userId: user.id,
      reason: 'user',
      actorUserId: user.id,
      // The cutoff keeps this legacy token by jti and revokes other no-sid tokens.
      exceptSessionId: current,
      exceptJti: readSessionJti(request),
    });
    return { revoked };
  }

  @Post('mfa/setup')
  @HttpCode(200)
  async startMfaSetup(@Req() request: AuthenticatedHttpRequest): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.caller(request);
    return this.mfaService.startEnrollment(user, await this.policyLoader.load()).catch(mapAccountSecurityError);
  }

  @Post('mfa/setup/confirm')
  @HttpCode(200)
  async confirmMfaSetup(
    @Req() request: AuthenticatedHttpRequest,
    @Body() body: AccountMfaCodeDto,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.caller(request);
    const recoveryCodes = await this.limited(user.id, () => this.mfaService.confirmEnrollment(user, body.code));
    return { recoveryCodes };
  }

  @Post('mfa/disable')
  @HttpCode(204)
  async disableMfa(@Req() request: AuthenticatedHttpRequest, @Body() body: AccountMfaCodeDto): Promise<void> {
    const user = await this.caller(request);
    const policy = await this.policyLoader.load();
    // Paket 5.4.0-a: a remaining passkey is a second factor, so TOTP may go.
    const passkeys = await this.passkeyCredentialService.countCredentials(user.id);
    await this.limited(user.id, () => this.mfaService.disable(user, policy, body.code, passkeys > 0));
  }

  @Post('mfa/recovery-codes')
  @HttpCode(200)
  async regenerateRecoveryCodes(
    @Req() request: AuthenticatedHttpRequest,
    @Body() body: AccountMfaCodeDto,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.caller(request);
    const recoveryCodes = await this.limited(user.id, () => this.mfaService.regenerateRecoveryCodes(user, body.code));
    return { recoveryCodes };
  }

  private limited<T>(userId: string, run: () => Promise<T>): Promise<T> {
    return this.loginAttemptLimiter.guard(mfaAttemptKey(userId), () => run().catch(mapAccountSecurityError));
  }

  private async caller(request: AuthenticatedHttpRequest): Promise<AuthenticationUserRecord> {
    const principal = readAuthenticatedPrincipal(request);
    const user = principal === null ? null : await this.userLoader.findById(principal.subjectId);
    if (user === null || !user.isActive) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Authentication failed' });
    }
    return user;
  }
}
