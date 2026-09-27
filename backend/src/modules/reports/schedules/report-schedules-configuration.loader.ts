import { Injectable } from '@nestjs/common';
import { readInstallationTimeZone } from '../../settings/read-installation-time-zone';
import { settingKeys } from '../../settings/setting-keys';
import { SettingsService } from '../../settings/settings.service';
import { reportScheduleSendTimePattern } from './report-schedule-calendar';

export type ReportSchedulesConfiguration = {
  readonly enabled: boolean;
  readonly maxSchedules: number;
  readonly maxRecipients: number;
  readonly attachmentMaxRows: number;
  readonly defaultSendTime: string;
  readonly timeZone: string;
};

export const reportSchedulesDefaults = {
  enabled: true,
  maxSchedules: 50,
  maxRecipients: 25,
  attachmentMaxRows: 10_000,
  defaultSendTime: '07:00',
} as const;

/** Paket 2.5 (§8): scheduled report settings with safe fallbacks. */
@Injectable()
export class ReportSchedulesConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<ReportSchedulesConfiguration> {
    const read = (key: string) => this.settingsService.getSetting(key as never).catch(() => undefined);
    const [enabled, maxSchedules, maxRecipients, attachmentMaxRows, defaultSendTime, timeZone] = await Promise.all([
      read(settingKeys.privateReportsScheduledEnabled),
      read(settingKeys.privateReportsScheduledMaxSchedules),
      read(settingKeys.privateReportsScheduledMaxRecipients),
      read(settingKeys.privateReportsScheduledAttachmentMaxRows),
      read(settingKeys.privateReportsScheduledDefaultSendTime),
      readInstallationTimeZone(this.settingsService),
    ]);
    return parseReportSchedulesConfiguration({
      enabled,
      maxSchedules,
      maxRecipients,
      attachmentMaxRows,
      defaultSendTime,
      timeZone,
    });
  }
}

export function parseReportSchedulesConfiguration(raw: {
  readonly enabled: unknown;
  readonly maxSchedules: unknown;
  readonly maxRecipients: unknown;
  readonly attachmentMaxRows: unknown;
  readonly defaultSendTime: unknown;
  readonly timeZone: string;
}): ReportSchedulesConfiguration {
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : reportSchedulesDefaults.enabled,
    maxSchedules: intIn(raw.maxSchedules, 1, 200, reportSchedulesDefaults.maxSchedules),
    maxRecipients: intIn(raw.maxRecipients, 1, 100, reportSchedulesDefaults.maxRecipients),
    attachmentMaxRows: intIn(raw.attachmentMaxRows, 100, 50_000, reportSchedulesDefaults.attachmentMaxRows),
    defaultSendTime:
      typeof raw.defaultSendTime === 'string' && reportScheduleSendTimePattern.test(raw.defaultSendTime)
        ? raw.defaultSendTime
        : reportSchedulesDefaults.defaultSendTime,
    timeZone: raw.timeZone,
  };
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
