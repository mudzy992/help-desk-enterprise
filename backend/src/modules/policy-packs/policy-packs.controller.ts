import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { AdminReadOperation } from '../authorization/admin-read-operation.decorator';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { ApplyPolicyPackDto } from './dto/apply-policy-pack.dto';
import { UnapplyPolicyPackDto } from './dto/unapply-policy-pack.dto';
import { PolicyPacksService } from './policy-packs.service';
import { readSettingsActorUserId } from '../settings/read-settings-actor-user-id';
import { readAuditRequestId } from '../audit-log/read-audit-request-id';

@Controller('policy-packs')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class PolicyPacksController {
  constructor(private readonly policyPacksService: PolicyPacksService) {}

  @Get()
  @UseGuards(RoleGuard)
  @RequireRoles(authorizationRoleKeys.admin)
  @RequirePermissions(permissionKeys.settingsWrite)
  list() {
    return this.policyPacksService.list();
  }

  @Get('persisted')
  @UseGuards(RoleGuard)
  @RequireRoles(authorizationRoleKeys.admin)
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  listPersisted() {
    return this.policyPacksService.listPersisted();
  }

  /**
   * M5 B4: the panel and its texts say SuperAdmin only, so the endpoint now
   * says the same (`settings.write` stays as the second gate). Applying a pack
   * that carries permissions is exactly the kind of change that belongs to the
   * break-glass account.
   *
   * M5 B3: the OU guard is gone on purpose — a pack may be assigned to a
   * service and/or an OU, and which target the pack needs is decided by its
   * grant scopes in `plan-policy-pack-apply.ts` (400 `MISSING_*`). A request
   * without any target touches nothing and never reaches the database.
   */
  @Post('validate')
  @AdminReadOperation()
  @UseGuards(RoleGuard)
  @RequireRoles(authorizationRoleKeys.superAdmin)
  @RequirePermissions(permissionKeys.settingsWrite)
  validate(@Body() body: ApplyPolicyPackDto) {
    return this.policyPacksService.validate(body);
  }

  @Post('apply')
  @UseGuards(RoleGuard)
  @RequireRoles(authorizationRoleKeys.superAdmin)
  @RequirePermissions(permissionKeys.settingsWrite)
  apply(@Body() body: ApplyPolicyPackDto, @Req() request: AuthenticatedHttpRequest) {
    return this.policyPacksService.apply(
      body,
      readSettingsActorUserId(request),
      readAuditRequestId(request.headers),
    );
  }

  /** M5 B5: same gates as apply, same actor/audit plumbing, reverse effect. */
  @Post('unapply')
  @UseGuards(RoleGuard)
  @RequireRoles(authorizationRoleKeys.superAdmin)
  @RequirePermissions(permissionKeys.settingsWrite)
  unapply(
    @Body() body: UnapplyPolicyPackDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.policyPacksService.unapply(
      body,
      readSettingsActorUserId(request),
      readAuditRequestId(request.headers),
    );
  }
}
