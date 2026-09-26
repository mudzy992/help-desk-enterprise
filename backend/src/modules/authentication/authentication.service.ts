import {
  ForbiddenException,
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { authenticationConstants } from './authentication.constants';
import { AuthenticationError } from './authentication.error';
import { AuthenticationProviderResolver } from './authentication-provider.resolver';
import { AuthenticationUserLoader } from './authentication-user.loader';
import type {
  AuthenticatedPrincipal,
  AuthenticationCredentials,
  AuthenticationLoginResponse,
  AuthenticationSessionResponse,
  AuthenticationUserRecord,
  PasswordAuthenticationCredentials,
  SessionAccessTokenClaims,
  SignInContext,
} from './authentication.types';
import { createAuthenticatedPrincipal } from './create-authenticated-principal';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { SessionTokenService } from './session-token.service';
import { toAuthorizationPrincipal } from './to-authorization-principal';
import { AccountSecurityError, mapAccountSecurityError } from './security/account-security.error';
import { AccountSecurityNotifier } from './security/account-security-notifier';
import { AccountSecurityPolicyLoader } from './security/account-security-policy.loader';
import { isPasswordExpired } from './security/account-security-rules';
import { MfaService } from './security/mfa.service';
import { PasswordChangeService } from './security/password-change.service';
import { SessionRegistryService } from './security/session-registry.service';

const unknownContext: SignInContext = { ipAddress: null, userAgent: null };

export function mfaAttemptKey(userId: string): string {
  return `auth:mfa-fail:${userId}`;
}

/**
 * Sign-in orchestration. Paket 2.1: password → (expired? change) → (MFA?
 * verify | enroll) → session. Every session is issued through
 * `issueSession`, so each one has a registry row and a `sid` claim.
 */
@Injectable()
export class AuthenticationService {
  constructor(
    private readonly authenticationProviderResolver: AuthenticationProviderResolver,
    private readonly sessionTokenService: SessionTokenService,
    private readonly authenticationUserLoader: AuthenticationUserLoader,
    private readonly prisma: PrismaService,
    private readonly policyLoader: AccountSecurityPolicyLoader,
    private readonly mfaService: MfaService,
    private readonly sessionRegistry: SessionRegistryService,
    private readonly passwordChangeService: PasswordChangeService,
    private readonly notifier: AccountSecurityNotifier,
    private readonly loginAttemptLimiter: LoginAttemptLimiter,
  ) {}

  async loginWithPassword(
    input: { readonly email: string; readonly password: string },
    context: SignInContext = unknownContext,
  ): Promise<AuthenticationLoginResponse> {
    const credentials: PasswordAuthenticationCredentials = {
      kind: 'password',
      email: input.email,
      password: input.password,
    };
    return this.completeLogin(credentials, context);
  }

  async loginWithEntraIdToken(
    idToken: string,
    context: SignInContext = unknownContext,
  ): Promise<AuthenticationSessionResponse> {
    const response = await this.completeLogin({ kind: 'entra_id_token', idToken }, context);
    if ('status' in response) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Authentication failed' });
    }
    return response;
  }

  async changePasswordWithToken(
    input: { readonly passwordChangeToken: string; readonly newPassword: string },
    context: SignInContext = unknownContext,
  ): Promise<AuthenticationLoginResponse> {
    try {
      const claims = await this.sessionTokenService.verifyPasswordChangeToken(input.passwordChangeToken);
      const user = await this.authenticationUserLoader.findById(claims.subjectId);
      if (user === null || !user.isActive || !user.mustChangePassword) {
        throw new AuthenticationError('INVALID_CREDENTIALS');
      }
      await this.passwordChangeService.assertAcceptable(user.id, user.email, input.newPassword);
      await this.passwordChangeService.apply(user.id, input.newPassword, user.id);
      // Review 2026-09-25 (S2): sessions issued before the new password stop working.
      await this.sessionRegistry.revokeAll({ userId: user.id, reason: 'password_change', actorUserId: user.id });
      const refreshed = (await this.authenticationUserLoader.findById(user.id)) ?? user;
      return await this.continueAfterPassword(refreshed, 'local', context);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /** Second step with MFA already set up: TOTP or recovery code. */
  async verifyMfa(
    input: { readonly mfaToken: string; readonly code: string },
    context: SignInContext = unknownContext,
  ): Promise<AuthenticationSessionResponse> {
    try {
      const { claims, user } = await this.readMfaToken(input.mfaToken, 'verify');
      const method = await this.loginAttemptLimiter.guard(mfaAttemptKey(user.id), async () => {
        try {
          return await this.mfaService.verify(user, input.code);
        } catch (error) {
          if (error instanceof AccountSecurityError && error.code === 'MFA_INVALID_CODE') {
            await this.notifier.audit(auditLogActions.authMfaFailed, user.id, null);
          }
          return mapAccountSecurityError(error);
        }
      });
      await this.sessionTokenService.consumeMfaToken(claims);
      return await this.issueSession(user, 'local', method, context);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /** Forced set-up during sign-in: returns the secret for the QR code. */
  async startMfaEnrollment(mfaToken: string): Promise<{ secret: string; otpauthUri: string }> {
    try {
      const { user } = await this.readMfaToken(mfaToken, 'enroll');
      return await this.mfaService.startEnrollment(user, await this.policyLoader.load());
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  async confirmMfaEnrollment(
    input: { readonly mfaToken: string; readonly code: string },
    context: SignInContext = unknownContext,
  ): Promise<AuthenticationSessionResponse & { readonly recoveryCodes: string[] }> {
    try {
      const { claims, user } = await this.readMfaToken(input.mfaToken, 'enroll');
      const recoveryCodes = await this.loginAttemptLimiter.guard(mfaAttemptKey(user.id), () =>
        this.mfaService.confirmEnrollment(user, input.code).catch(mapAccountSecurityError),
      );
      await this.sessionTokenService.consumeMfaToken(claims);
      const session = await this.issueSession(user, 'local', 'totp', context);
      return { ...session, recoveryCodes };
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /** Review 2026-09-25 + Paket 2.1: the same session continues with a fresh token. */
  async refresh(
    claims: SessionAccessTokenClaims,
    principal: AuthenticatedPrincipal,
    context: SignInContext = unknownContext,
  ): Promise<AuthenticationSessionResponse> {
    let sessionId = claims.sessionId;
    if (sessionId === null) {
      // A token from before the registry: give it a row on the first refresh.
      const policy = await this.policyLoader.load();
      sessionId = (
        await this.sessionRegistry.create({
          userId: principal.subjectId,
          provider: 'legacy',
          mfaMethod: null,
          context,
          policy,
          isAdmin: false,
        })
      ).id;
    } else {
      await this.sessionRegistry.touch(sessionId, context);
    }
    const accessToken = await this.sessionTokenService.issue(principal, sessionId);
    await this.sessionTokenService.revoke(claims);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: authenticationConstants.sessionTtlSeconds,
      principal: toAuthorizationPrincipal(principal),
    };
  }

  /** Sign out ends the whole session (every refreshed token), not one token. */
  async logout(claims: SessionAccessTokenClaims): Promise<void> {
    await this.sessionTokenService.revoke(claims);
    if (claims.sessionId !== null) {
      await this.sessionRegistry.revoke({
        userId: claims.subjectId,
        sessionId: claims.sessionId,
        reason: 'logout',
        actorUserId: claims.subjectId,
      });
    }
  }

  private async completeLogin(
    credentials: AuthenticationCredentials,
    context: SignInContext,
  ): Promise<AuthenticationLoginResponse> {
    try {
      const provider = await this.authenticationProviderResolver.resolve();
      const principal = await provider.authenticate(credentials);
      const user = await this.authenticationUserLoader.findById(principal.subjectId);
      if (user === null || !user.isActive) {
        throw new AuthenticationError('INVALID_CREDENTIALS');
      }
      if (credentials.kind !== 'password') {
        // Entra: MFA and password rules belong to Microsoft (Conditional Access).
        return await this.issueSession(user, 'entra', null, context);
      }
      if (!user.mustChangePassword) {
        const policy = await this.policyLoader.load();
        if (isPasswordExpired(user, policy)) {
          await this.prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
          await this.notifier.audit(auditLogActions.authPasswordExpired, user.id, null);
          return await this.mustChangePassword(user, 'expired');
        }
      }
      if (user.mustChangePassword) {
        return await this.mustChangePassword(user, 'temporary');
      }
      return await this.continueAfterPassword(user, 'local', context);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private async mustChangePassword(
    user: AuthenticationUserRecord,
    reason: 'temporary' | 'expired',
  ): Promise<AuthenticationLoginResponse> {
    return {
      status: 'MUST_CHANGE_PASSWORD',
      passwordChangeToken: await this.sessionTokenService.issuePasswordChangeToken(user.id),
      expiresInSeconds: authenticationConstants.passwordChangeTokenTtlSeconds,
      reason,
    };
  }

  /** Password accepted: decide whether a second factor comes next. */
  private async continueAfterPassword(
    user: AuthenticationUserRecord,
    provider: 'local',
    context: SignInContext,
  ): Promise<AuthenticationLoginResponse> {
    const policy = await this.policyLoader.load();
    const requirement = this.mfaService.requirementFor(user, policy);
    if (requirement !== 'unavailable' && (await this.mfaService.isEnabled(user.id))) {
      return {
        status: 'MFA_REQUIRED',
        mfaToken: await this.sessionTokenService.issueMfaToken(user.id, 'verify'),
        expiresInSeconds: authenticationConstants.mfaTokenTtlSeconds,
      };
    }
    if (requirement === 'required') {
      return {
        status: 'MFA_ENROLLMENT_REQUIRED',
        mfaToken: await this.sessionTokenService.issueMfaToken(user.id, 'enroll'),
        expiresInSeconds: authenticationConstants.mfaTokenTtlSeconds,
      };
    }
    return this.issueSession(user, provider, null, context);
  }

  private async issueSession(
    user: AuthenticationUserRecord,
    provider: 'local' | 'entra',
    mfaMethod: 'totp' | 'recovery' | null,
    context: SignInContext,
  ): Promise<AuthenticationSessionResponse> {
    const policy = await this.policyLoader.load();
    const session = await this.sessionRegistry.create({
      userId: user.id,
      provider,
      mfaMethod,
      context,
      policy,
      isAdmin: user.roleKeys.some(
        (key) => key === authenticationConstants.superAdminRoleKey || key === 'ADMIN',
      ),
    });
    const principal = createAuthenticatedPrincipal({
      subjectId: user.id,
      email: user.email,
      displayName: user.displayName,
      isLocalOnly: user.isLocalOnly,
    });
    const accessToken = await this.sessionTokenService.issue(principal, session.id);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: authenticationConstants.sessionTtlSeconds,
      principal: toAuthorizationPrincipal(principal),
    };
  }

  private async readMfaToken(token: string, stage: 'verify' | 'enroll') {
    const claims = await this.sessionTokenService.verifyMfaToken(token);
    if (claims.stage !== stage) {
      throw new AuthenticationError('INVALID_CREDENTIALS');
    }
    const user = await this.authenticationUserLoader.findById(claims.subjectId);
    if (user === null || !user.isActive || user.mustChangePassword) {
      throw new AuthenticationError('INVALID_CREDENTIALS');
    }
    return { claims, user };
  }

  private toHttpException(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }
    if (error instanceof AccountSecurityError) {
      mapAccountSecurityError(error);
    }
    // Paket 1.8: a verified Microsoft identity may learn why it cannot sign in.
    if (
      error instanceof AuthenticationError &&
      (error.code === 'ACCOUNT_DISABLED' ||
        error.code === 'ENTRA_ACCOUNT_NOT_REGISTERED' ||
        error.code === 'ENTRA_ACCOUNT_CONFLICT')
    ) {
      throw new ForbiddenException({ code: error.code, message: 'Sign-in is not allowed for this account' });
    }
    if (
      error instanceof AuthenticationError &&
      (error.code === 'UNSUPPORTED_AUTHENTICATION_MODE' || error.code === 'AUTHENTICATION_UNAVAILABLE')
    ) {
      throw new ServiceUnavailableException({ code: 'AUTHENTICATION_UNAVAILABLE', message: 'Authentication is unavailable' });
    }
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Authentication failed' });
  }
}
