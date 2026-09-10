import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authenticationConstants } from './authentication.constants';
import {
  AuthenticationError,
  createInvalidCredentialsError,
} from './authentication.error';
import type {
  AuthenticatedPrincipal,
  SessionAccessTokenClaims,
} from './authentication.types';
import { JwtSigningSecretLoader } from './jwt-signing-secret.loader';
import { readSessionSubjectId } from './read-session-subject-id';

@Injectable()
export class SessionTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly jwtSigningSecretLoader: JwtSigningSecretLoader,
  ) {}

  async issue(principal: AuthenticatedPrincipal): Promise<string> {
    const secret = await this.jwtSigningSecretLoader.load();
    return this.jwtService.signAsync(
      { sub: principal.subjectId },
      {
        secret,
        expiresIn: `${authenticationConstants.sessionTtlSeconds}s`,
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
      return { subjectId: readSessionSubjectId(payload) };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw createInvalidCredentialsError();
    }
  }
}
