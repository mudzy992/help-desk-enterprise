import {
  ForbiddenException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
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
import { LoginSecurityMetricsService } from './security/login-security-metrics.service';
import { PasskeyCredentialService, passkeyLoginChallengeKey } from './security/passkey-credential.service';
import { WebAuthnRpLoader } from './security/webauthn-rp.loader';
import { PasswordChangeService } from './security/password-change.service';
import { SessionIdleTimeoutLoader } from './security/session-idle-timeout.loader';
import { JwtSigningSecretLoader } from './jwt-signing-secret.loader';
import {
  buildLoginFailedAuditMetadata,
  loginFailedEntityId,
  type LoginFailedProvider,
} from './security/login-failed-audit';
import { SessionRegistryService } from './security/session-registry.service';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';

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
  private readonly logger = new Logger(AuthenticationService.name);

  constructor(
    private readonly authenticationProviderResolver: AuthenticationProviderResolver,
    private readonly sessionTokenService: SessionTokenService,
    private readonly authenticationUserLoader: AuthenticationUserLoader,
    private readonly prisma: PrismaService,
    private readonly policyLoader: AccountSecurityPolicyLoader,
    private readonly mfaService: MfaService,
    private readonly sessionRegistry: SessionRegistryService,
    private readonly passwordChangeService: PasswordChangeService,
    private readonly passkeyCredentialService: PasskeyCredentialService,
    private readonly webAuthnRpLoader: WebAuthnRpLoader,
    private readonly notifier: AccountSecurityNotifier,
    private readonly loginAttemptLimiter: LoginAttemptLimiter,
    // Paket 5.4.0-b: MFA failure metrics (optional — never blocks sign-in).
    @Optional() private readonly securityMetrics?: LoginSecurityMetricsService,
    // Paket 5.4.0-c: optional for backwards-compatible unit/module wiring.
    @Optional() private readonly idleTimeoutLoader?: SessionIdleTimeoutLoader,
    // Paket 5.4.0-d (M6): the rate-limit HMAC secret, reused so `login_failed`
    // carries the same versioned pseudonyms as the Redis counters.
    @Optional() private readonly jwtSigningSecretLoader?: JwtSigningSecretLoader,
  ) {}

  async loginWithPassword(
    input: {
      readonly email: string;
      readonly password: string;
      readonly rememberMe?: boolean;
    },
    context: SignInContext = unknownContext,
  ): Promise<AuthenticationLoginResponse> {
    const credentials: PasswordAuthenticationCredentials = {
      kind: 'password',
      email: input.email,
      password: input.password,
      rememberMe: input.rememberMe === true,
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
      return await this.continueAfterPassword(refreshed, 'local', context, false);
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
            // Paket 5.4.0-b: the metric never blocks the login path.
            if (this.securityMetrics !== undefined) await this.securityMetrics.record('mfa-failures');
          }
          return mapAccountSecurityError(error);
        }
      });
      await this.sessionTokenService.consumeMfaToken(claims);
      return await this.issueSession(
        user,
        'local',
        method,
        context,
        claims.rememberMe,
      );
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /**
   * Paket 5.4.0-a (M1): passkey as the second factor. The challenge is bound
   * to the single-use mfa token's `jti`, so two parallel sign-ins of the same
   * account never consume each other's ceremonies.
   */
  async startMfaPasskey(mfaToken: string): Promise<{ options: Record<string, unknown> }> {
    try {
      const { claims, user } = await this.readMfaToken(mfaToken, 'verify');
      return await this.passkeyCredentialService.startAuthentication(
        user.id,
        passkeyLoginChallengeKey(claims.jti),
        this.webAuthnRpLoader.load(),
      );
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  async verifyMfaPasskey(
    input: { readonly mfaToken: string; readonly assertion: Record<string, unknown> },
    context: SignInContext = unknownContext,
  ): Promise<AuthenticationSessionResponse> {
    try {
      const { claims, user } = await this.readMfaToken(input.mfaToken, 'verify');
      await this.loginAttemptLimiter.guard(mfaAttemptKey(user.id), () =>
        this.passkeyCredentialService
          .verifyAssertion(
            user.id,
            passkeyLoginChallengeKey(claims.jti),
            input.assertion as unknown as AuthenticationResponseJSON,
            this.webAuthnRpLoader.load(),
            false,
            context.ipAddress,
          )
          .catch(mapAccountSecurityError),
      );
      await this.sessionTokenService.consumeMfaToken(claims);
      return await this.issueSession(
        user,
        'local',
        'passkey',
        context,
        claims.rememberMe,
      );
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
      const session = await this.issueSession(
        user,
        'local',
        'totp',
        context,
        claims.rememberMe,
      );
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
    let rememberMe = false;
    if (sessionId === null) {
      // A token from before the registry: give it a short-lived row on the
      // first refresh. Legacy claims never opt themselves into 30 days.
      const policy = await this.policyLoader.load();
      sessionId = (
        await this.sessionRegistry.create({
          userId: principal.subjectId,
          provider: 'legacy',
          mfaMethod: null,
          context,
          policy,
          isAdmin: false,
          rememberMe: false,
        })
      ).id;
    } else {
      const session = await this.sessionRegistry.findActive(sessionId);
      rememberMe = session?.rememberMe ?? claims.rememberMe;
      const idleTimeoutSeconds =
        (await this.idleTimeoutLoader?.load()) ?? 0;
      if (
        session !== null &&
        idleTimeoutSeconds > 0 &&
        Date.now() - session.lastSeenAt.getTime() > idleTimeoutSeconds * 1000
      ) {
        await this.sessionRegistry.revoke({
          userId: session.userId,
          sessionId,
          reason: 'idle_timeout',
          actorUserId: null,
        });
        throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
      }
      await this.sessionRegistry.touch(sessionId, context, rememberMe);
    }
    const ttlSeconds = rememberMe
      ? authenticationConstants.rememberMeSessionTtlSeconds
      : authenticationConstants.sessionTtlSeconds;
    const accessToken = await this.sessionTokenService.issue(
      principal,
      sessionId,
      { ttlSeconds, rememberMe },
    );
    await this.sessionTokenService.revoke(claims);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: ttlSeconds,
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
      let principal: AuthenticatedPrincipal;
      try {
        principal = await provider.authenticate(credentials);
      } catch (error) {
        // Paket 5.4.0-d (M6): only a real credential rejection is recorded.
        // The limiter wraps this call from the controller, so a 429 never
        // reaches this catch; a validation error or an internal failure has
        // another error code. The local provider also answers
        // INVALID_CREDENTIALS when the SuperAdmin local-only invariant would
        // be violated — that sign-in did fail on its credentials, so it
        // belongs in the same trail.
        if (
          error instanceof AuthenticationError &&
          error.code === 'INVALID_CREDENTIALS'
        ) {
          await this.auditLoginFailed(credentials, context);
        }
        throw error;
      }
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
      return await this.continueAfterPassword(
        user,
        'local',
        context,
        credentials.rememberMe === true,
      );
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /**
   * Paket 5.4.0-d (M6): one sanitized entry per rejected credential. The write
   * is awaited — a successful audit is not silently dropped — but every
   * failure is swallowed, so the caller still receives the generic
   * authentication answer. Nothing here logs or stores the e-mail, the IP, the
   * password or the token; only keyed digests, the provider and the reason.
   */
  private async auditLoginFailed(
    credentials: AuthenticationCredentials,
    context: SignInContext,
  ): Promise<void> {
    try {
      const provider: LoginFailedProvider =
        credentials.kind === 'password' ? 'local' : 'entra';
      let secret: string | null = null;
      if (this.jwtSigningSecretLoader !== undefined) {
        try {
          secret = await this.jwtSigningSecretLoader.load();
        } catch {
          // No key: the entry keeps the provider/reason pair and omits the
          // pseudonyms instead of writing an unkeyed digest of an address.
          secret = null;
        }
      }
      const metadata = buildLoginFailedAuditMetadata({
        provider,
        email: credentials.kind === 'password' ? credentials.email : null,
        ipAddress: context.ipAddress,
        hmacSecret: secret,
      });
      await recordAuditEntry(this.prisma, {
        action: auditLogActions.authLoginFailed,
        entityType: auditLogEntityTypes.authEvent,
        entityId: loginFailedEntityId(metadata),
        actorUserId: null,
        metadata: metadata as never,
      });
    } catch (error) {
      // Never turn an audit problem into a different sign-in answer, and never
      // log the values that were being pseudonymized.
      this.logger.warn(
        `auth.login_failed audit write failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
  }

  private async mustChangePassword(
    user: AuthenticationUserRecord,
    reason: 'temporary' | 'expired',
  ): Promise<AuthenticationLoginResponse> {
    // Paket 5.1 (M2 #2): the forced-change screen shows the same minimum the
    // server enforces (was hard-coded to 12 in the client).
    const policy = await this.policyLoader.load();
    return {
      status: 'MUST_CHANGE_PASSWORD',
      passwordChangeToken: await this.sessionTokenService.issuePasswordChangeToken(user.id),
      expiresInSeconds: authenticationConstants.passwordChangeTokenTtlSeconds,
      reason,
      passwordMinLength: policy.passwordMinLength,
    };
  }

  /** Password accepted: decide whether a second factor comes next. */
  private async continueAfterPassword(
    user: AuthenticationUserRecord,
    provider: 'local',
    context: SignInContext,
    rememberMe: boolean,
  ): Promise<AuthenticationLoginResponse> {
    const policy = await this.policyLoader.load();
    // Paket 5.1 (M2 #1): the flow (verify / enroll / none) is a separate
    // decision from the enrolment requirement — see `resolveMfaFlow`.
    const enrolled = await this.mfaService.isEnabled(user.id);
    const flow = this.mfaService.flowFor(user, policy, enrolled);
    if (flow === 'verify') {
      return {
        status: 'MFA_REQUIRED',
        mfaToken: await this.sessionTokenService.issueMfaToken(
          user.id,
          'verify',
          rememberMe,
        ),
        expiresInSeconds: authenticationConstants.mfaTokenTtlSeconds,
        // Paket 5.4.0-a: the screen offers the factors the account really has;
        // an absent field means a client predating passkeys — TOTP only.
        methods: await this.availableMfaMethods(user.id, enrolled),
      };
    }
    if (flow === 'enroll') {
      return {
        status: 'MFA_ENROLLMENT_REQUIRED',
        mfaToken: await this.sessionTokenService.issueMfaToken(
          user.id,
          'enroll',
          rememberMe,
        ),
        expiresInSeconds: authenticationConstants.mfaTokenTtlSeconds,
      };
    }
    return this.issueSession(user, provider, null, context, rememberMe);
  }

  /** Paket 5.4.0-a: passkey joins TOTP as a presentable second factor. */
  private async availableMfaMethods(
    userId: string,
    totpEnrolled: boolean,
  ): Promise<readonly ('totp' | 'passkey')[]> {
    const methods: ('totp' | 'passkey')[] = [];
    if (totpEnrolled) methods.push('totp');
    try {
      if ((await this.passkeyCredentialService.countCredentials(userId)) > 0) methods.push('passkey');
    } catch {
      // A missing WebAuthn table/config must not break the TOTP-only login.
    }
    return methods.length > 0 ? methods : ['totp'];
  }

  private async issueSession(
    user: AuthenticationUserRecord,
    provider: 'local' | 'entra',
    // Paket 5.4.0-a: 'passkey' joins the registry column (VarChar(16)).
    mfaMethod: 'totp' | 'recovery' | 'passkey' | null,
    context: SignInContext,
    rememberMe = false,
  ): Promise<AuthenticationSessionResponse> {
    // Break-glass SUPER_ADMIN sessions always remain short-lived, even when a
    // client sends rememberMe=true directly instead of using our login form.
    const effectiveRememberMe =
      rememberMe &&
      !user.roleKeys.includes(authenticationConstants.superAdminRoleKey);
    const ttlSeconds = effectiveRememberMe
      ? authenticationConstants.rememberMeSessionTtlSeconds
      : authenticationConstants.sessionTtlSeconds;
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
      rememberMe: effectiveRememberMe,
    });
    const principal = createAuthenticatedPrincipal({
      subjectId: user.id,
      email: user.email,
      displayName: user.displayName,
      isLocalOnly: user.isLocalOnly,
    });
    const accessToken = await this.sessionTokenService.issue(
      principal,
      session.id,
      { ttlSeconds, rememberMe: effectiveRememberMe },
    );
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: ttlSeconds,
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
