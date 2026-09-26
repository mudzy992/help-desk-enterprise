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
} from './authentication.types';
import { JwtSigningSecretLoader } from './jwt-signing-secret.loader';
import { readPasswordChangeSubjectId } from './read-password-change-subject-id';
import { readSessionSubjectId } from './read-session-subject-id';
import { SessionRevocationStore } from './session-revocation.store';

@Injectable()
export class SessionTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly jwtSigningSecretLoader: JwtSigningSecretLoader,
    @Optional()
    private readonly revocation: SessionRevocationStore = new SessionRevocationStore(),
  ) {}

  async issue(principal: AuthenticatedPrincipal, sessionId: string | null = null): Promise<string> {
    const secret = await this.jwtSigningSecretLoader.load();
    return this.jwtService.signAsync(
      // Paket 2.1: `sid` ties every refreshed token to one registry row.
      sessionId === null ? { sub: principal.subjectId } : { sub: principal.subjectId, sid: sessionId },
      {
        secret,
        jwtid: randomUUID(),
        expiresIn: `${authenticationConstants.sessionTtlSeconds}s`,
      },
    );
  }

  /** Sign out: this token stops working now, not at its expiry. */
  async revoke(claims: SessionAccessTokenClaims): Promise<void> {
    await this.revocation.revokeToken(claims.jti, claims.expiresAt);
  }

  /** Paket 2.1: every token of one session (all refreshes) stops working. */
  async revokeSession(sessionId: string): Promise<void> {
    await this.revocation.revokeSession(sessionId, authenticationConstants.sessionTtlSeconds);
  }

  /**
   * Paket 2.1 (M3): short, single-use token between the password and the
   * second factor. `stage` = verify (MFA set up) or enroll (forced set-up).
   */
  async issueMfaToken(subjectId: string, stage: MfaTokenStage): Promise<string> {
    const secret = await this.jwtSigningSecretLoader.load();
    return this.jwtService.signAsync(
      { sub: subjectId.trim(), purpose: authenticationConstants.mfaPurpose, stage },
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
  async revokeAllForUser(subjectId: string): Promise<void> {
    await this.revocation.revokeAllForUser(
      subjectId,
      authenticationConstants.sessionTtlSeconds,
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

  async verify(accessToken: string): Promise<SessionAccessTokenClaims> {
    if (accessToken.trim().length === 0) {
      throw createInvalidCredentialsError();
    }
    try {
      const secret = await this.jwtSigningSecretLoader.load();
      const payload: unknown = await this.jwtService.verifyAsync(accessToken, {
        secret,
      });
      const subjectId = readSessionSubjectId(payload);
      const record = payload as { jti?: unknown; iat?: unknown; exp?: unknown; sid?: unknown; purpose?: unknown };
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
      };
      if (await this.revocation.isRevoked({ ...claims })) {
        throw createInvalidCredentialsError();
      }
      return claims;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw createInvalidCredentialsError();
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
