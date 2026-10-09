import { Body, Controller, HttpCode, Post, Req, UnauthorizedException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import {
  type AuthenticatedHttpRequest,
  readPrincipalContext,
  readSessionId,
} from '../authentication/authenticated-request';
import { readSignInContext } from '../authentication/read-sign-in-context';
import { IdentityPasskeyService, PasskeyIdentityError } from './identity-passkey.service';

/**
 * Paket 5.4.0-a (M1): passkey step-up for sensitive actions ("Potvrdi
 * passkeyjem" next to the TOTP code prompt). Session-authenticated only —
 * the caller acts on their own identity confirmation.
 *
 * The purpose is fixed for now; later waves (5.4.0-d: bulk password reset,
 * rate-limit changes) pass their own purpose so markers cannot be reused
 * across actions.
 */
export const defaultIdentityPurpose = 'identity-confirmation';

export class PasskeyStepUpStartDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  purpose?: string;
}

export class PasskeyStepUpVerifyDto {
  @IsObject()
  assertion!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  purpose?: string;
}

@Controller('security/identity')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class SecurityIdentityController {
  constructor(private readonly identityPasskeyService: IdentityPasskeyService) {}

  @Post('passkey/start')
  @HttpCode(200)
  async start(
    @Req() request: AuthenticatedHttpRequest,
    @Body() body: PasskeyStepUpStartDto,
  ): Promise<{ options: Record<string, unknown> }> {
    const subjectId = this.subjectId(request);
    return this.identityPasskeyService
      .start(this.sessionId(request), subjectId, body.purpose?.trim() || defaultIdentityPurpose)
      .catch(this.mapError);
  }

  @Post('passkey/verify')
  @HttpCode(204)
  async verify(
    @Req() request: AuthenticatedHttpRequest,
    @Body() body: PasskeyStepUpVerifyDto,
  ): Promise<void> {
    const subjectId = this.subjectId(request);
    await this.identityPasskeyService
      .verify(
        this.sessionId(request),
        subjectId,
        body.purpose?.trim() || defaultIdentityPurpose,
        body.assertion,
        readSignInContext(request).ipAddress,
      )
      .catch(this.mapError);
  }

  private subjectId(request: AuthenticatedHttpRequest): string {
    const context = readPrincipalContext(request);
    if (context === null) {
      throw new UnauthorizedException({ code: 'SESSION_NOT_FOUND' });
    }
    return context.subjectId;
  }

  private sessionId(request: AuthenticatedHttpRequest): string {
    const sessionId = readSessionId(request);
    if (sessionId === null) {
      // Step-up is bound to the registry session; legacy no-sid tokens must
      // re-authenticate before confirming anything.
      throw new UnauthorizedException({ code: 'SESSION_NOT_FOUND' });
    }
    return sessionId;
  }

  private mapError(error: unknown): never {
    if (error instanceof PasskeyIdentityError) {
      throw new UnauthorizedException({
        code: error.code,
        ...(error.code === 'IDENTITY_CONFIRMATION_REQUIRED' ? { method: 'passkey' } : {}),
      });
    }
    throw error;
  }
}
