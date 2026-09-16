import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { authenticationConstants } from './authentication.constants';
import { AuthenticationError } from './authentication.error';
import { AuthenticationProviderResolver } from './authentication-provider.resolver';
import { AuthenticationUserLoader } from './authentication-user.loader';
import type {
  AuthenticationCredentials,
  AuthenticationLoginResponse,
  AuthenticationSessionResponse,
  PasswordAuthenticationCredentials,
} from './authentication.types';
import { changePasswordWithToken } from './change-password-with-token';
import { SessionTokenService } from './session-token.service';
import { toAuthorizationPrincipal } from './to-authorization-principal';

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly authenticationProviderResolver: AuthenticationProviderResolver,
    private readonly sessionTokenService: SessionTokenService,
    private readonly authenticationUserLoader: AuthenticationUserLoader,
    private readonly prisma: PrismaService,
  ) {}

  async loginWithPassword(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<AuthenticationLoginResponse> {
    const credentials: PasswordAuthenticationCredentials = {
      kind: 'password',
      email: input.email,
      password: input.password,
    };
    return this.completeLogin(credentials);
  }

  async loginWithEntraIdToken(
    idToken: string,
  ): Promise<AuthenticationSessionResponse> {
    const response = await this.completeLogin({
      kind: 'entra_id_token',
      idToken,
    });
    if ('status' in response) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Authentication failed',
      });
    }
    return response;
  }

  async changePasswordWithToken(input: {
    readonly passwordChangeToken: string;
    readonly newPassword: string;
  }): Promise<AuthenticationSessionResponse> {
    try {
      return await changePasswordWithToken({
        sessionTokenService: this.sessionTokenService,
        authenticationUserLoader: this.authenticationUserLoader,
        prisma: this.prisma,
        passwordChangeToken: input.passwordChangeToken,
        newPassword: input.newPassword,
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw this.toHttpException(error);
    }
  }

  private async completeLogin(
    credentials: AuthenticationCredentials,
  ): Promise<AuthenticationLoginResponse> {
    try {
      const provider = await this.authenticationProviderResolver.resolve();
      const principal = await provider.authenticate(credentials);
      const user = await this.authenticationUserLoader.findById(
        principal.subjectId,
      );
      if (user === null || !user.isActive) {
        throw new AuthenticationError('INVALID_CREDENTIALS');
      }
      if (user.mustChangePassword) {
        const passwordChangeToken =
          await this.sessionTokenService.issuePasswordChangeToken(user.id);
        return {
          status: 'MUST_CHANGE_PASSWORD',
          passwordChangeToken,
          expiresInSeconds:
            authenticationConstants.passwordChangeTokenTtlSeconds,
        };
      }
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
