import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { defaultAppName } from './branding.constants';

export type Branding = {
  readonly appName: string;
  readonly tagline: string;
  readonly organizationName: string;
  readonly logoDataUrl: string;
  readonly supportEmail: string;
  readonly supportUrl: string;
};

/** Paket 4.1 (§3a): one place that resolves the client's branding with neutral fallbacks. */
@Injectable()
export class BrandingService {
  constructor(private readonly settings: SettingsService) {}

  async load(): Promise<Branding> {
    const [appName, tagline, organizationName, logoDataUrl, supportEmail, supportUrl] = await Promise.all([
      this.text(settingKeys.publicBrandingAppName),
      this.text(settingKeys.publicBrandingTagline),
      this.text(settingKeys.publicBrandingOrganizationName),
      this.text(settingKeys.publicBrandingLogoDataUrl),
      this.text(settingKeys.publicBrandingSupportEmail),
      this.text(settingKeys.publicBrandingSupportUrl),
    ]);
    return { appName: appName || defaultAppName, tagline, organizationName, logoDataUrl, supportEmail, supportUrl };
  }

  private async text(key: string): Promise<string> {
    try {
      const value = await this.settings.getSetting(key as never);
      return typeof value === 'string' ? value.trim() : '';
    } catch {
      return '';
    }
  }
}
