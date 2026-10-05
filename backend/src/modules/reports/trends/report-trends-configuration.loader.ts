import { Injectable } from '@nestjs/common';
import { readInstallationTimeZone } from '../../settings/read-installation-time-zone';
import { settingKeys } from '../../settings/setting-keys';
import { SettingsService } from '../../settings/settings.service';
import { parseCsatScaleMax } from '../parse-reports-configuration';
import { reportTrendDefaults, reportTrendSettingRanges } from './report-trends.constants';
import type { ReportTrendsConfiguration } from './report-trends.types';

/** Paket 2.5: trend settings; a missing or out-of-range value falls back to the default. */
@Injectable()
export class ReportTrendsConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<ReportTrendsConfiguration> {
    const read = (key: string) => this.settingsService.getSetting(key as never).catch(() => undefined);
    const [enabled, maxMonths, cacheSeconds, slaTargetPercent, csatMinSample, csatScaleMax, timeZone] =
      await Promise.all([
        read(settingKeys.privateReportsTrendsEnabled),
        read(settingKeys.privateReportsTrendsMaxMonths),
        read(settingKeys.privateReportsTrendsCacheSeconds),
        read(settingKeys.privateReportsTrendsSlaTargetPercent),
        read(settingKeys.privateReportsTrendsCsatMinSample),
        // M9/B3 (drugi dio): ista postavka koju koriste Pregled i tab CSAT.
        read(settingKeys.privateCsatScaleMax),
        readInstallationTimeZone(this.settingsService),
      ]);
    return parseReportTrendsConfiguration({
      enabled,
      maxMonths,
      cacheSeconds,
      slaTargetPercent,
      csatMinSample,
      csatScaleMax,
      timeZone,
    });
  }
}

export function parseReportTrendsConfiguration(raw: {
  readonly enabled: unknown;
  readonly maxMonths: unknown;
  readonly cacheSeconds: unknown;
  readonly slaTargetPercent: unknown;
  readonly csatMinSample: unknown;
  /**
   * M9/B3 (drugi dio): `private.csat.scaleMax`; neispravna vrijednost → 5.
   * Opcionalno, kao i u `parseReportsConfiguration` — postavka može izostati.
   */
  readonly csatScaleMax?: unknown;
  readonly timeZone: string;
}): ReportTrendsConfiguration {
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : reportTrendDefaults.enabled,
    maxMonths: intIn(raw.maxMonths, reportTrendSettingRanges.maxMonths, reportTrendDefaults.maxMonths),
    cacheSeconds: intIn(raw.cacheSeconds, reportTrendSettingRanges.cacheSeconds, reportTrendDefaults.cacheSeconds),
    slaTargetPercent: intIn(
      raw.slaTargetPercent,
      reportTrendSettingRanges.slaTargetPercent,
      reportTrendDefaults.slaTargetPercent,
    ),
    csatMinSample: intIn(raw.csatMinSample, reportTrendSettingRanges.csatMinSample, reportTrendDefaults.csatMinSample),
    csatScaleMax: parseCsatScaleMax(raw.csatScaleMax),
    timeZone: raw.timeZone,
  };
}

function intIn(value: unknown, range: { readonly min: number; readonly max: number }, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max
    ? value
    : fallback;
}
