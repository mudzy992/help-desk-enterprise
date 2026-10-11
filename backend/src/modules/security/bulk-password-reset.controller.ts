import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  type AuthenticatedHttpRequest,
  readAuthenticatedPrincipal,
  readSessionId,
} from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { BulkPasswordResetService } from './bulk-password-reset.service';

/*
  Paket 5.4.0-d (M5): `POST /security/bulk-password-reset` — SuperAdmin only,
  with a fresh proof of identity (passkey step-up for the `bulk-password-reset`
  purpose, obtained through `POST /security/identity/passkey/verify`, or a
  current TOTP code). The rate-limit marker uses another purpose and is
  therefore not accepted here.
*/

export class BulkPasswordResetDto {
  /** Current TOTP code; omit it when a fresh passkey step-up was used. */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;
}

@Controller('security/bulk-password-reset')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.superAdmin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class BulkPasswordResetController {
  constructor(
    private readonly bulkPasswordResetService: BulkPasswordResetService,
  ) {}

  @Post()
  @HttpCode(200)
  execute(
    @Req() request: AuthenticatedHttpRequest,
    @Body() body: BulkPasswordResetDto,
  ) {
    const principal = readAuthenticatedPrincipal(request);
    if (principal === null) {
      throw new UnauthorizedException({ code: 'SESSION_NOT_FOUND' });
    }
    return this.bulkPasswordResetService.execute(
      { subjectId: principal.subjectId, sessionId: readSessionId(request) },
      { code: body.code },
    );
  }
}
