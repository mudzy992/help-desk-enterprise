import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import {
  defaultSecurityRateLimitConfig,
  isIntegerWithinBounds,
  securityRateLimitBounds,
  type SecurityRateLimitConfig,
} from './security-rate-limit-config';

/**
 * Paket 5.4.0-b (M2): reads the scalar `private.security.rateLimits.*`
 * settings. The limiter calls this per request, so an administrator's change
 * takes effect immediately — no restart. A missing, invalid or unreadable
 * value falls back to the default (the pre-5.4 constant), never to a weaker
 * limit: the bounds in the definitions keep stored values sane and this
 * loader only accepts integers inside the same bounds.
 */
@Injectable()
export class SecurityRateLimitConfigLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<SecurityRateLimitConfig> {
    const d = defaultSecurityRateLimitConfig;
    const get = async (key: string, fallback: number, bounds: { min: number; max: number }): Promise<number> => {
      try {
        const value = await this.settingsService.getSetting(key as never);
        return isIntegerWithinBounds(value, bounds) ? value : fallback;
      } catch {
        return fallback;
      }
    };
    const b = securityRateLimitBounds;
    const [
      accountWindowSeconds,
      accountDelayStartsAfterFailures,
      accountDelayBaseMilliseconds,
      accountDelayMaxMilliseconds,
      ipMaxFailures,
      ipWindowSeconds,
      otherMaxFailures,
      otherWindowSeconds,
    ] = await Promise.all([
      get(settingKeys.privateSecurityRateLimitsAccountWindowSeconds, d.accountWindowSeconds, b.accountWindowSeconds),
      get(
        settingKeys.privateSecurityRateLimitsAccountDelayStartsAfterFailures,
        d.accountDelayStartsAfterFailures,
        b.accountDelayStartsAfterFailures,
      ),
      get(
        settingKeys.privateSecurityRateLimitsAccountDelayBaseMilliseconds,
        d.accountDelayBaseMilliseconds,
        b.accountDelayBaseMilliseconds,
      ),
      get(
        settingKeys.privateSecurityRateLimitsAccountDelayMaxMilliseconds,
        d.accountDelayMaxMilliseconds,
        b.accountDelayMaxMilliseconds,
      ),
      get(settingKeys.privateSecurityRateLimitsIpMaxFailures, d.ipMaxFailures, b.ipMaxFailures),
      get(settingKeys.privateSecurityRateLimitsIpWindowSeconds, d.ipWindowSeconds, b.ipWindowSeconds),
      get(settingKeys.privateSecurityRateLimitsOtherMaxFailures, d.otherMaxFailures, b.otherMaxFailures),
      get(settingKeys.privateSecurityRateLimitsOtherWindowSeconds, d.otherWindowSeconds, b.otherWindowSeconds),
    ]);
    return {
      accountWindowSeconds,
      accountDelayStartsAfterFailures,
      accountDelayBaseMilliseconds,
      accountDelayMaxMilliseconds,
      ipMaxFailures,
      ipWindowSeconds,
      otherMaxFailures,
      otherWindowSeconds,
    };
  }
}
