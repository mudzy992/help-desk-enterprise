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
} from './authenticated-request';
import { AccountMfaCodeDto, AccountPasswordChangeDto } from './dto/mfa.dto';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { mfaAttemptKey } from './authentication.service';
import { SessionAuthenticationGuard } from './session-authentication.guard';
import { AccountSecurityError, mapAccountSecurityError } from './security/account-security.error';
import { AccountSecurityPolicyLoader } from './security/account-security-policy.loader';
import { passwordExpiresAt } from './security/account-security-rules';
import { type MfaStatus, MfaService } from './security/mfa.service';
import { PasswordChangeService } from './security/password-change.service';
import { SessionRegistryService, type UserSessionView } from './security/session-registry.service';

export type AccountSecurityOverview = {
  readonly mfa: MfaStatus;
  readonly password: {
    readonly hasLocalPassword: boolean;
    readonly changedAt: string | null;
    readonly expiresAt: string | null;
    readonly minLength: number;
    readonly blocklistEnabled: boolean;
    readonly historyCount: number;
  };
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
  ) {}

  @Get('security')
  async overview(@Req() request: AuthenticatedHttpRequest): Promise<AccountSecurityOverview> {
    const user = await this.caller(request);
    const policy = await this.policyLoader.load();
    const expiresAt = user.localPasswordHash ? passwordExpiresAt(user, policy) : null;
    return {
      mfa: await this.mfaService.status(user, policy),
      password: {
        hasLocalPassword: user.localPasswordHash !== null,
        changedAt: user.passwordChangedAt?.toISOString() ?? null,
        expiresAt: expiresAt?.toISOString() ?? null,
        minLength: policy.passwordMinLength,
        blocklistEnabled: policy.passwordBlocklistEnabled,
        historyCount: policy.passwordHistoryCount,
      },
    };
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
      // A pre-registry token has no sid: then everything else still ends, it keeps working.
      exceptSessionId: current ?? '00000000-0000-0000-0000-000000000000',
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
    await this.limited(user.id, () => this.mfaService.disable(user, policy, body.code));
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
