import { Body, Controller, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { ApplySlaTimerConfigurationMigrationDto, PreviewSlaTimerConfigurationMigrationDto } from './dto/timer-configuration-migration.dto';
import { mapSlaError } from './map-sla-error';
import { readSlaMutationContext } from './read-sla-mutation-context';
import { SlaGlobalAdministrationGuard } from './sla-global-administration.guard';
import { SlaTimerConfigurationMigrationService } from './sla-timer-configuration-migration.service';

@Controller('sla/timer-configuration-migrations')
@UseGuards(SessionAuthenticationGuard, RoleGuard, SlaGlobalAdministrationGuard)
@RequireRoles(authorizationRoleKeys.admin)
@RequirePermissions(permissionKeys.slaWrite)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class SlaTimerConfigurationMigrationController {
  constructor(private readonly migrations: SlaTimerConfigurationMigrationService) {}

  @Post('preview')
  async preview(@Body() body: PreviewSlaTimerConfigurationMigrationDto) {
    try {
      return await this.migrations.preview(body);
    } catch (error) {
      throw mapSlaError(error);
    }
  }

  @Post('apply')
  async apply(
    @Body() body: ApplySlaTimerConfigurationMigrationDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    try {
      return await this.migrations.apply({
        ...body,
        actorUserId: readSlaMutationContext(request).actorUserId,
      });
    } catch (error) {
      throw mapSlaError(error);
    }
  }
}
