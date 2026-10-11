import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';

const MIN_IDLE_TIMEOUT_SECONDS = 5 * 60;
const MAX_IDLE_TIMEOUT_SECONDS = 30 * 24 * 60 * 60;

/**
 * Paket 5.4.0-c (M4): reads the server-enforced session idle timeout.
 * A missing, unreadable or invalid value fails open to disabled so a settings
 * outage can never lock every user out of the application.
 */
@Injectable()
export class SessionIdleTimeoutLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<number> {
    try {
      const value = await this.settingsService.getSetting(
        settingKeys.privateSecuritySessionIdleTimeoutSeconds,
      );
      return SessionIdleTimeoutLoader.validate(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  static validate(value: unknown): value is number {
    return (
      value === 0 ||
      (typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= MIN_IDLE_TIMEOUT_SECONDS &&
        value <= MAX_IDLE_TIMEOUT_SECONDS)
    );
  }
}
