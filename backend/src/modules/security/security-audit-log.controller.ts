import {
  Controller,
  Get,
  Header,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  auditLogListDefaultTake,
  auditLogListMaxTake,
} from '../audit-log/audit-log.constants';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';

/*
  Paket 5.4.0-d (M6): the admin security journal — a filtered view over the
  existing tamper-evident audit log, restricted to `auth.` actions.

  * the `auth.` prefix is pinned in the query itself, so no filter value can
    widen it to another event class; an explicit `action` filter must start
    with `auth.` or the request is refused;
  * `userId` matches the **target** user (`entityId`) or the **actor**
    (`actorUserId`) of the entry — the semantics are documented on the screen;
  * the global cross-OU view (it includes login failures, which have no OU) is
    SUPER_ADMIN-only; a regular ADMIN gets 403 and the UI shows the forbidden
    state. The OU-scoped `/audit-logs` endpoint is untouched;
  * cursor pagination reuses the audit-log pattern (`take` + `cursor`);
  * no export and no retention logic of its own — the privacy module's
    retention applies to these rows exactly as to every other audit row.
*/

export class SecurityAuditLogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(auditLogListMaxTake)
  take?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/^auth\./, { message: 'action must start with auth.' })
  action?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  userId?: string;
}

@Controller('security/audit-log')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.superAdmin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SecurityAuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: SecurityAuditLogQueryDto) {
    return this.auditLogService.listAuthSecurityEvents({
      action: query.action ?? null,
      userId: query.userId ?? null,
      take: query.take ?? auditLogListDefaultTake,
      cursor: query.cursor ?? null,
    });
  }
}
