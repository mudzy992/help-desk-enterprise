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

  async issue(principal: AuthenticatedPrincipal): Promise<string> {
    const secret = await this.jwtSigningSecretLoader.load();
    return this.jwtService.signAsync(
      { sub: principal.subjectId },
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
      const record = payload as { jti?: unknown; iat?: unknown; exp?: unknown };
      const claims: SessionAccessTokenClaims = {
        subjectId,
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
