import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { authenticationConstants } from './authentication.constants';
import {
  AuthenticationError,
  createInvalidCredentialsError,
} from './authentication.error';
import type {
  AuthenticatedPrincipal,
  MfaTokenClaims,
  MfaTokenStage,
  PasswordChangeTokenClaims,
  SessionAccessTokenClaims,
  VerifiedSessionAccessToken,
} from './authentication.types';
import { JwtSigningSecretLoader } from './jwt-signing-secret.loader';
import { readPasswordChangeSubjectId } from './read-password-change-subject-id';
import { readSessionSubjectId } from './read-session-subject-id';
import { SessionRevocationStore, type SessionRevocationExceptions } from './session-revocation.store';

export type SocketSessionLeaseClaims = Omit<SessionAccessTokenClaims, 'jti'> & {
  readonly jti: string;
  readonly authzVersion: number;
};

export type SocketSessionLeaseCheck = Pick<
  SocketSessionLeaseClaims,
  'subjectId' | 'sessionId' | 'jti' | 'issuedAt' | 'expiresAt' | 'authzVersion'
>;

@Injectable()
export class SessionTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly jwtSigningSecretLoader: JwtSigningSecretLoader,
    @Optional()
    private readonly revocation: SessionRevocationStore = new SessionRevocationStore(),
  ) {}

  async issue(
    principal: AuthenticatedPrincipal,
    sessionId: string | null = null,
    options: { readonly ttlSeconds?: number; readonly rememberMe?: boolean } = {},
  ): Promise<string> {
    const secret = await this.jwtSigningSecretLoader.load();
    return this.jwtService.signAsync(
      {
        sub: principal.subjectId,
        // Paket 2.1: `sid` ties every refreshed token to one registry row.
        ...(sessionId === null ? {} : { sid: sessionId }),
        // Keep the default token shape backward compatible: only remembered
        // sessions carry the compact claim.
        ...(options.rememberMe === true ? { rem: true } : {}),
      },
      {
        secret,
        jwtid: randomUUID(),
        expiresIn: `${options.ttlSeconds ?? authenticationConstants.sessionTtlSeconds}s`,
      },
    );
  }

  /** Sign out: this token stops working now, not at its expiry. */
  async revoke(claims: SessionAccessTokenClaims): Promise<void> {
    await this.revocation.revokeToken(claims.jti, claims.expiresAt);
  }

  /** Paket 2.1: every token of one session (all refreshes) stops working. */
  async revokeSession(sessionId: string): Promise<void> {
    await this.revocation.revokeSession(
      sessionId,
      authenticationConstants.revocationCutoffSeconds,
    );
  }

  /**
   * Paket 2.1 (M3): short, single-use token between the password and the
   * second factor. `stage` = verify (MFA set up) or enroll (forced set-up).
   */
  async issueMfaToken(
    subjectId: string,
    stage: MfaTokenStage,
    rememberMe = false,
  ): Promise<string> {
    const secret = await this.jwtSigningSecretLoader.load();
    return this.jwtService.signAsync(
      {
        sub: subjectId.trim(),
        purpose: authenticationConstants.mfaPurpose,
        stage,
        ...(rememberMe ? { rem: true } : {}),
      },
      { secret, jwtid: randomUUID(), expiresIn: `${authenticationConstants.mfaTokenTtlSeconds}s` },
    );
  }

  async verifyMfaToken(token: string): Promise<MfaTokenClaims> {
    if (token.trim().length === 0) {
      throw createInvalidCredentialsError();
    }
    try {
      const secret = await this.jwtSigningSecretLoader.load();
      const payload = (await this.jwtService.verifyAsync(token, { secret })) as Record<string, unknown>;
      const stage = payload['stage'];
      if (
        payload['purpose'] !== authenticationConstants.mfaPurpose ||
        typeof payload['sub'] !== 'string' ||
        typeof payload['jti'] !== 'string' ||
        (stage !== 'verify' && stage !== 'enroll')
      ) {
        throw createInvalidCredentialsError();
      }
      const claims: MfaTokenClaims = {
        subjectId: payload['sub'],
        stage,
        jti: payload['jti'],
        expiresAt: typeof payload['exp'] === 'number' ? payload['exp'] : 0,
        rememberMe: payload['rem'] === true,
      };
      if (await this.revocation.isRevoked({ jti: claims.jti, subjectId: claims.subjectId, issuedAt: Number.MAX_SAFE_INTEGER })) {
        throw createInvalidCredentialsError();
      }
      return claims;
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw createInvalidCredentialsError();
    }
  }

  /** The MFA token is single use: consumed once a session was issued. */
  async consumeMfaToken(claims: MfaTokenClaims): Promise<void> {
    await this.revocation.revokeToken(claims.jti, claims.expiresAt);
  }

  /** Password change: every earlier session of the user stops working. */
  async revokeAllForUser(
    subjectId: string,
    exceptions?: SessionRevocationExceptions,
  ): Promise<void> {
    await this.revocation.revokeAllForUser(
      subjectId,
      authenticationConstants.revocationCutoffSeconds,
      exceptions,
    );
  }

  async issuePasswordChangeToken(subjectId: string): Promise<string> {
    const secret = await this.jwtSigningSecretLoader.load();
    return this.jwtService.signAsync(
      {
        sub: subjectId.trim(),
        purpose: authenticationConstants.passwordChangePurpose,
      },
      {
        secret,
        expiresIn: `${authenticationConstants.passwordChangeTokenTtlSeconds}s`,
      },
    );
  }

  async verify(accessToken: string): Promise<VerifiedSessionAccessToken> {
    if (accessToken.trim().length === 0) {
      throw createInvalidCredentialsError();
    }
    try {
      const secret = await this.jwtSigningSecretLoader.load();
      const payload: unknown = await this.jwtService.verifyAsync(accessToken, {
        secret,
      });
      const subjectId = readSessionSubjectId(payload);
      const record = payload as {
        jti?: unknown;
        iat?: unknown;
        exp?: unknown;
        sid?: unknown;
        rem?: unknown;
        purpose?: unknown;
      };
      // An MFA or password-change token is never a session token.
      if (record.purpose !== undefined) {
        throw createInvalidCredentialsError();
      }
      const claims: SessionAccessTokenClaims = {
        subjectId,
        sessionId: typeof record.sid === 'string' ? record.sid : null,
        jti: typeof record.jti === 'string' ? record.jti : null,
        issuedAt: typeof record.iat === 'number' ? record.iat : 0,
        expiresAt: typeof record.exp === 'number' ? record.exp : 0,
        rememberMe: record.rem === true,
      };
      const verification = await this.revocation.check({ ...claims });
      if (verification.revoked) {
        throw createInvalidCredentialsError();
      }
      return {
        ...claims,
        ...(verification.durableAuthority === undefined
          ? {}
          : { durableAuthority: verification.durableAuthority }),
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw createInvalidCredentialsError();
    }
  }

  /**
   * Socket handshakes require the metadata used by the ongoing session lease.
   * Older tokens without a jti or a durable authority snapshot remain usable by
   * the HTTP compatibility path, but are not allowed to create long-lived
   * authenticated sockets.
   */
  async verifyForSocket(accessToken: string): Promise<SocketSessionLeaseClaims> {
    const claims = await this.verify(accessToken);
    const authority = claims.durableAuthority;
    const jti = claims.jti;
    if (
      jti === null ||
      jti.trim().length === 0 ||
      !Number.isSafeInteger(claims.issuedAt) ||
      claims.issuedAt < 0 ||
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.expiresAt <= claims.issuedAt ||
      claims.expiresAt <= Math.floor(Date.now() / 1000) ||
      authority === undefined ||
      authority.subjectId !== claims.subjectId ||
      !authority.isActive ||
      authority.mustChangePassword ||
      !Number.isSafeInteger(authority.authzVersion) ||
      authority.authzVersion < 0
    ) {
      throw createInvalidCredentialsError();
    }
    return {
      subjectId: claims.subjectId,
      sessionId: claims.sessionId,
      jti,
      issuedAt: claims.issuedAt,
      expiresAt: claims.expiresAt,
      rememberMe: claims.rememberMe,
      authzVersion: authority.authzVersion,
    };
  }

  /**
   * Periodic WebSocket safety-net check. Any unavailable durable/cache check,
   * expiry, revocation, deactivation or authz-version drift invalidates the
   * lease; callers must disconnect rather than preserve the old socket.
   */
  async isSocketSessionCurrent(
    claims: SocketSessionLeaseCheck,
  ): Promise<boolean> {
    if (
      claims.jti.trim().length === 0 ||
      !Number.isSafeInteger(claims.issuedAt) ||
      claims.issuedAt < 0 ||
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.expiresAt <= claims.issuedAt ||
      claims.expiresAt <= Math.floor(Date.now() / 1000) ||
      !Number.isSafeInteger(claims.authzVersion) ||
      claims.authzVersion < 0
    ) {
      return false;
    }
    try {
      const check = await this.revocation.check({ ...claims });
      const authority = check.durableAuthority;
      return (
        !check.revoked &&
        authority !== undefined &&
        authority.subjectId === claims.subjectId &&
        authority.authzVersion === claims.authzVersion &&
        authority.isActive &&
        !authority.mustChangePassword
      );
    } catch {
      return false;
    }
  }

  async verifyPasswordChangeToken(
    accessToken: string,
  ): Promise<PasswordChangeTokenClaims> {
    if (accessToken.trim().length === 0) {
      throw createInvalidCredentialsError();
    }
    try {
      const secret = await this.jwtSigningSecretLoader.load();
      const payload: unknown = await this.jwtService.verifyAsync(accessToken, {
        secret,
      });
      return {
        subjectId: readPasswordChangeSubjectId(payload),
        purpose: authenticationConstants.passwordChangePurpose,
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw createInvalidCredentialsError();
    }
  }
}
