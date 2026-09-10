import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { OuAccessGuard } from '../authorization/ou-access.guard';
import { RequireOrganizationalUnitScope } from '../authorization/require-organizational-unit-scope.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { ApplyPolicyPackDto } from './dto/apply-policy-pack.dto';
import { PolicyPacksService } from './policy-packs.service';

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

  @Post('validate')
  @UseGuards(OuAccessGuard)
  @RequireRoles(authorizationRoleKeys.admin)
  @RequirePermissions(permissionKeys.settingsWrite)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  validate(@Body() body: ApplyPolicyPackDto) {
    return this.policyPacksService.validate(body);
  }

  @Post('apply')
  @UseGuards(OuAccessGuard)
  @RequireRoles(authorizationRoleKeys.admin)
  @RequirePermissions(permissionKeys.settingsWrite)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  apply(@Body() body: ApplyPolicyPackDto) {
    return this.policyPacksService.apply(body);
  }
}
