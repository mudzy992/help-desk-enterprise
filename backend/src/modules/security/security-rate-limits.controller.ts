import { Body, Controller, Get, HttpCode, Put, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UnauthorizedException } from '@nestjs/common';
import {
  type AuthenticatedHttpRequest,
  readAuthenticatedPrincipal,
  readSessionId,
} from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { securityRateLimitBounds } from '../authentication/security/security-rate-limit-config';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { SecurityRateLimitsService } from './security-rate-limits.service';

/*
  Paket 5.4.0-b (M2): SUPER_ADMIN endpoints for the login rate limits.
  GET returns the effective configuration with the bounds the admin form
  validates against; PUT retunes all eight values in one journalled batch and
  requires a proof of identity (passkey step-up marker for this purpose or a
  current TOTP code). The change reaches the limiter on the next request.
*/

export class SecurityRateLimitConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(securityRateLimitBounds.accountWindowSeconds.min)
  @Max(securityRateLimitBounds.accountWindowSeconds.max)
  accountWindowSeconds!: number;

  @Type(() => Number)
  @IsInt()
  @Min(securityRateLimitBounds.accountDelayStartsAfterFailures.min)
  @Max(securityRateLimitBounds.accountDelayStartsAfterFailures.max)
  accountDelayStartsAfterFailures!: number;

  @Type(() => Number)
  @IsInt()
  @Min(securityRateLimitBounds.accountDelayBaseMilliseconds.min)
  @Max(securityRateLimitBounds.accountDelayBaseMilliseconds.max)
  accountDelayBaseMilliseconds!: number;

  @Type(() => Number)
  @IsInt()
  @Min(securityRateLimitBounds.accountDelayMaxMilliseconds.min)
  @Max(securityRateLimitBounds.accountDelayMaxMilliseconds.max)
  accountDelayMaxMilliseconds!: number;

  @Type(() => Number)
  @IsInt()
  @Min(securityRateLimitBounds.ipMaxFailures.min)
  @Max(securityRateLimitBounds.ipMaxFailures.max)
  ipMaxFailures!: number;

  @Type(() => Number)
  @IsInt()
  @Min(securityRateLimitBounds.ipWindowSeconds.min)
  @Max(securityRateLimitBounds.ipWindowSeconds.max)
  ipWindowSeconds!: number;

  @Type(() => Number)
  @IsInt()
  @Min(securityRateLimitBounds.otherMaxFailures.min)
  @Max(securityRateLimitBounds.otherMaxFailures.max)
  otherMaxFailures!: number;

  @Type(() => Number)
  @IsInt()
  @Min(securityRateLimitBounds.otherWindowSeconds.min)
  @Max(securityRateLimitBounds.otherWindowSeconds.max)
  otherWindowSeconds!: number;
}

export class UpdateSecurityRateLimitsDto {
  @Type(() => SecurityRateLimitConfigDto)
  config!: SecurityRateLimitConfigDto;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;
}

@Controller('security/rate-limits')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.superAdmin)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class SecurityRateLimitsController {
  constructor(private readonly rateLimitsService: SecurityRateLimitsService) {}

  @Get()
  @HttpCode(200)
  current() {
    return this.rateLimitsService.current();
  }

  @Put()
  @HttpCode(200)
  update(@Req() request: AuthenticatedHttpRequest, @Body() body: UpdateSecurityRateLimitsDto) {
    const principal = readAuthenticatedPrincipal(request);
    if (principal === null) {
      throw new UnauthorizedException({ code: 'SESSION_NOT_FOUND' });
    }
    return this.rateLimitsService.update(
      { subjectId: principal.subjectId, sessionId: readSessionId(request) },
      { config: body.config, reason: body.reason, code: body.code },
    );
  }
}
