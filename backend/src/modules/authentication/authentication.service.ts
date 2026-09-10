import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticationConstants } from './authentication.constants';
import { AuthenticationError } from './authentication.error';
import { AuthenticationProviderResolver } from './authentication-provider.resolver';
import type {
  AuthenticationSessionResponse,
  PasswordAuthenticationCredentials,
} from './authentication.types';
import { SessionTokenService } from './session-token.service';
import { toAuthorizationPrincipal } from './to-authorization-principal';

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly authenticationProviderResolver: AuthenticationProviderResolver,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async loginWithPassword(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<AuthenticationSessionResponse> {
    const credentials: PasswordAuthenticationCredentials = {
      kind: 'password',
      email: input.email,
      password: input.password,
    };
    try {
      const provider = await this.authenticationProviderResolver.resolve();
      const principal = await provider.authenticate(credentials);
      const accessToken = await this.sessionTokenService.issue(principal);
      return {
        accessToken,
        tokenType: 'Bearer',
        expiresInSeconds: authenticationConstants.sessionTtlSeconds,
        principal: toAuthorizationPrincipal(principal),
      };
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private toHttpException(error: unknown): never {
    if (
      error instanceof AuthenticationError &&
      (error.code === 'UNSUPPORTED_AUTHENTICATION_MODE' ||
        error.code === 'AUTHENTICATION_UNAVAILABLE')
    ) {
      throw new ServiceUnavailableException({
        code: 'AUTHENTICATION_UNAVAILABLE',
        message: 'Authentication is unavailable',
      });
    }
    throw new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Authentication failed',
    });
  }
}
