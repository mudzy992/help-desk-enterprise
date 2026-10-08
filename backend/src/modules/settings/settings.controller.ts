import { ReadSettingDependentsQueryDto } from './dto/read-setting-dependents.dto';
import { UpdateSettingsBatchDto } from './dto/update-settings-batch.dto';
import {
  Body,
  Controller,
  Get,
  Put,
  Query,
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
import {
  readEmailChannelSettings,
  type EmailChannelSettingsResponse,
} from './read-email-channel-settings';
import {
  readSettingsAddons,
  type SettingsAddonsRecord,
} from './read-settings-addons';
import { readSettingsActorUserId } from './read-settings-actor-user-id';
import { SettingsService } from './settings.service';
import type { SettingDependentReset } from './plan-dependent-resets';
import type { SettingRegistryEntry } from './settings.types';

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

  @Get()
  async listSettingsRegistry(): Promise<readonly SettingRegistryEntry[]> {
    try {
      return await this.settingsService.listRegistry();
    } catch (error) {
      throw mapSettingsError(error);
    }
  }

  /**
   * Paket 5.3.4 (ispravka): the addon catalogue with the stored values, for the
   * authenticated settings tab. `GET /install/addons` stays default-only after
   * the installation (5.2 M1 #5) and must not be used to render switches.
   */
  @Get('addons')
  async listAddonCatalog(): Promise<SettingsAddonsRecord> {
    try {
      return await readSettingsAddons(this.settingsService);
    } catch (error) {
      throw mapSettingsError(error);
    }
  }

  @Get('email-channel')
  async getEmailChannelSettings(): Promise<EmailChannelSettingsResponse> {
    try {
      return await readEmailChannelSettings(this.settingsService);
    } catch (error) {
      throw mapSettingsError(error);
    }
  }

  /**
   * Paket 5.3.3 (D7): what switching this setting off would reset. The modal
   * shows the exact list before the administrator confirms; only dependents that
   * are switched on right now are returned, because only those would change.
   */
  @Get('dependents')
  async listSettingDependents(
    @Query() query: ReadSettingDependentsQueryDto,
  ): Promise<readonly SettingDependentReset[]> {
    try {
      return await this.settingsService.previewDependentResets(query.key);
    } catch (error) {
      throw mapSettingsError(error);
    }
  }

  @Put('batch')
  @RequirePermissions(permissionKeys.settingsWrite)
  async updateSettingsBatch(
    @Body() body: UpdateSettingsBatchDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<UpdateSettingsBatchResponse> {
    try {
      const result = await this.settingsService.setSettingValues(
        body.entries.map((entry) => ({ key: entry.key, value: entry.value })),
        { reason: body.reason, actorUserId: readSettingsActorUserId(request) },
        { resetDependents: body.resetDependents === true },
      );
      return toBatchResponse(result);
    } catch (error) {
      throw mapSettingsError(error);
    }
  }

  @Put()
  @RequirePermissions(permissionKeys.settingsWrite)
  async updateSetting(
    @Body() body: UpdateSettingDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<UpdateSettingsBatchResponse> {
    try {
      const result = await this.settingsService.setSettingValue(
        body.key,
        body.value,
        { reason: body.reason, actorUserId: readSettingsActorUserId(request) },
        { resetDependents: body.resetDependents === true },
      );
      return toBatchResponse(result);
    } catch (error) {
      throw mapSettingsError(error);
    }
  }
}

export type UpdateSettingsBatchResponse = {
  readonly updatedKeys: readonly string[];
  /** Dependents returned to their default, or erased when they have none. */
  readonly resetDependents: readonly SettingDependentReset[];
};

function toBatchResponse(input: {
  readonly updatedKeys: readonly string[];
  readonly resets: readonly SettingDependentReset[];
}): UpdateSettingsBatchResponse {
  return {
    updatedKeys: [...input.updatedKeys],
    resetDependents: input.resets.map((reset) => ({ ...reset })),
  };
}
