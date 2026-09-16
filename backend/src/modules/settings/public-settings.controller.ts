import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { mapSettingsError } from './map-settings-error';
import { SettingsService } from './settings.service';
import type { SettingValue } from './settings.types';

@Controller('settings')
@UseGuards(SessionAuthenticationGuard)
export class PublicSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('public')
  async listPublicSettings(): Promise<
    Readonly<Record<string, SettingValue | undefined>>
  > {
    try {
      return await this.settingsService.getPublicSettings();
    } catch (error) {
      throw mapSettingsError(error);
    }
  }
}
