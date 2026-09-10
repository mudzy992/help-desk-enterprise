import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { AuthenticationError } from './authentication.error';
import { parseAuthenticationMode } from './parse-authentication-mode';
import type { AuthenticationMode } from './authentication.types';

@Injectable()
export class AuthenticationModeLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<AuthenticationMode> {
    try {
      const value = await this.settingsService.getSetting(
        settingKeys.privateAuthMode,
      );
      return parseAuthenticationMode(value);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('UNSUPPORTED_AUTHENTICATION_MODE');
    }
  }
}
