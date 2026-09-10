import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { authenticationConstants } from './authentication.constants';
import { AuthenticationError } from './authentication.error';

@Injectable()
export class JwtSigningSecretLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<string> {
    try {
      const secret = await this.settingsService.getSecretForInternalUse(
        settingKeys.privateAuthJwtSigningSecret,
      );
      if (
        typeof secret !== 'string' ||
        secret.trim().length < authenticationConstants.minimumJwtSigningSecretLength
      ) {
        throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
      }
      return secret.trim();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
    }
  }
}
