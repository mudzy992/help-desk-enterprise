import {
  Body,
  Controller,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { mapSettingsError } from './map-settings-error';
import { readSettingsActorUserId } from './read-settings-actor-user-id';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Put()
  @RequirePermissions(permissionKeys.settingsWrite)
  async updateSetting(
    @Body() body: UpdateSettingDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    try {
      await this.settingsService.setSettingValue(body.key, body.value, {
        reason: body.reason,
        actorUserId: readSettingsActorUserId(request),
      });
    } catch (error) {
      throw mapSettingsError(error);
    }
  }
}
