import {
  Body,
  Controller,
  Get,
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
import {
  AuthenticationProvidersService,
  type AuthenticationProvidersResponse,
} from './authentication-providers.service';
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
import { MfaCodeDto, MfaTokenDto } from './dto/mfa.dto';
import { readSignInContext } from './read-sign-in-context';

type SignInRequest = {
  readonly ip?: string;
  readonly headers?: Record<string, string | string[] | undefined>;
};

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
    private readonly authenticationProvidersService: AuthenticationProvidersService,
  ) {}

  /** Paket 1.8: public — tells the login page which sign-in options exist. */
  @Get('providers')
  providers(): Promise<AuthenticationProvidersResponse> {
    return this.authenticationProvidersService.describe();
  }

  /**
   * Review 2026-09-25: sessions last 1 h and the SPA extends them while the user
   * is active. Paket 2.1: the refreshed token keeps the session id (`sid`).
   */
  @Post('refresh')
  @UseGuards(SessionAuthenticationGuard)
  async refresh(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: AuthenticatedHttpRequest & SignInRequest,
  ): Promise<AuthenticationSessionResponse> {
    const claims = await this.sessionTokenService.verify(
      readBearerAccessTokenFromHeader(authorization) ?? '',
    );
    const principal = request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY];
    if (principal === undefined) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Authentication failed' });
    }
    return this.authenticationService.refresh(
      claims,
      createAuthenticatedPrincipal({
        subjectId: principal.subjectId,
        email: principal.email,
        displayName: principal.displayName,
        isLocalOnly: principal.isLocalOnly,
      }),
      readSignInContext(request),
    );
  }

  /** Server-side sign out: the whole session ends (idempotent). */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<void> {
    try {
      const claims = await this.sessionTokenService.verify(
        readBearerAccessTokenFromHeader(authorization) ?? '',
      );
      await this.authenticationService.logout(claims);
    } catch {
      // Already invalid or expired: signing out is idempotent.
    }
  }

  @Post('login')
  login(
    @Body() body: LocalLoginDto,
    @Req() request: SignInRequest,
  ): Promise<AuthenticationLoginResponse> {
    return this.loginAttemptLimiter.guard(
      loginAttemptKey(body.email, request?.ip),
      () =>
        this.authenticationService.loginWithPassword(
          { email: body.email, password: body.password },
          readSignInContext(request),
        ),
    );
  }

  @Post('entra')
  loginWithEntra(
    @Body() body: EntraLoginDto,
    @Req() request?: SignInRequest,
  ): Promise<AuthenticationSessionResponse> {
    // Paket 1.8: rejected tokens count against the same per-IP window.
    return this.loginAttemptLimiter.guard(
      loginAttemptKey('entra', request?.ip),
      () => this.authenticationService.loginWithEntraIdToken(body.idToken, readSignInContext(request)),
    );
  }

  /** Paket 2.1: may continue with MFA (verify or forced enrollment). */
  @Post('change-password')
  changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ChangePasswordDto,
    @Req() request?: SignInRequest,
  ): Promise<AuthenticationLoginResponse> {
    const passwordChangeToken =
      readBearerAccessTokenFromHeader(authorization) ?? '';
    return this.loginAttemptLimiter.guard(
      changePasswordAttemptKey(request?.ip),
      () =>
        this.authenticationService.changePasswordWithToken(
          { passwordChangeToken, newPassword: body.newPassword },
          readSignInContext(request),
        ),
    );
  }

  /** Paket 2.1 (M3): second factor. Failures are limited per account (5 / 15 min). */
  @Post('mfa/verify')
  @HttpCode(200)
  verifyMfa(@Body() body: MfaCodeDto, @Req() request?: SignInRequest): Promise<AuthenticationSessionResponse> {
    return this.authenticationService.verifyMfa(body, readSignInContext(request));
  }

  /** Paket 2.1 (M2): forced enrollment during sign-in — secret for the QR code. */
  @Post('mfa/enroll/start')
  @HttpCode(200)
  startMfaEnrollment(@Body() body: MfaTokenDto): Promise<{ secret: string; otpauthUri: string }> {
    return this.authenticationService.startMfaEnrollment(body.mfaToken);
  }

  @Post('mfa/enroll/confirm')
  @HttpCode(200)
  confirmMfaEnrollment(
    @Body() body: MfaCodeDto,
    @Req() request?: SignInRequest,
  ): Promise<AuthenticationSessionResponse & { readonly recoveryCodes: string[] }> {
    return this.authenticationService.confirmMfaEnrollment(body, readSignInContext(request));
  }
}
