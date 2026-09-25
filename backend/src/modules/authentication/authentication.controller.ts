import {
  Body,
  Controller,
  Headers,
  HttpCode,
  UnauthorizedException,
  UseGuards,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import { SessionAuthenticationGuard } from './session-authentication.guard';
import { SessionTokenService } from './session-token.service';
import { authenticationConstants } from './authentication.constants';
import { createAuthenticatedPrincipal } from './create-authenticated-principal';
import {
  AUTHENTICATED_PRINCIPAL_REQUEST_KEY,
  type AuthenticatedHttpRequest,
} from './authenticated-request';
import {
  LoginAttemptLimiter,
  changePasswordAttemptKey,
  loginAttemptKey,
} from './login-attempt-limiter';
import type {
  AuthenticationLoginResponse,
  AuthenticationSessionResponse,
} from './authentication.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EntraLoginDto } from './dto/entra-login.dto';
import { LocalLoginDto } from './dto/local-login.dto';
import { readBearerAccessTokenFromHeader } from './read-bearer-access-token';

@Controller('auth')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AuthenticationController {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly loginAttemptLimiter: LoginAttemptLimiter,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  /**
   * Review 2026-09-25: sessions last 1 h and the SPA extends them while the user
   * is active. The old token is revoked, so a refresh never multiplies sessions.
   */
  @Post('refresh')
  @UseGuards(SessionAuthenticationGuard)
  async refresh(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<AuthenticationSessionResponse> {
    const claims = await this.sessionTokenService.verify(
      readBearerAccessTokenFromHeader(authorization) ?? '',
    );
    const principal = request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY];
    if (principal === undefined) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Authentication failed' });
    }
    const accessToken = await this.sessionTokenService.issue(
      createAuthenticatedPrincipal({
        subjectId: principal.subjectId,
        email: principal.email,
        displayName: principal.displayName,
        isLocalOnly: principal.isLocalOnly,
      }),
    );
    await this.sessionTokenService.revoke(claims);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: authenticationConstants.sessionTtlSeconds,
      principal,
    };
  }

  /** Server-side sign out: the token is revoked until it would have expired. */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<void> {
    try {
      const claims = await this.sessionTokenService.verify(
        readBearerAccessTokenFromHeader(authorization) ?? '',
      );
      await this.sessionTokenService.revoke(claims);
    } catch {
      // Already invalid or expired: signing out is idempotent.
    }
  }

  @Post('login')
  login(
    @Body() body: LocalLoginDto,
    @Req() request: { readonly ip?: string },
  ): Promise<AuthenticationLoginResponse> {
    return this.loginAttemptLimiter.guard(
      loginAttemptKey(body.email, request?.ip),
      () =>
        this.authenticationService.loginWithPassword({
          email: body.email,
          password: body.password,
        }),
    );
  }

  @Post('entra')
  loginWithEntra(
    @Body() body: EntraLoginDto,
  ): Promise<AuthenticationSessionResponse> {
    return this.authenticationService.loginWithEntraIdToken(body.idToken);
  }

  @Post('change-password')
  changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ChangePasswordDto,
    @Req() request?: { readonly ip?: string },
  ): Promise<AuthenticationSessionResponse> {
    const passwordChangeToken =
      readBearerAccessTokenFromHeader(authorization) ?? '';
    return this.loginAttemptLimiter.guard(
      changePasswordAttemptKey(request?.ip),
      () =>
        this.authenticationService.changePasswordWithToken({
          passwordChangeToken,
          newPassword: body.newPassword,
        }),
    );
  }
}
