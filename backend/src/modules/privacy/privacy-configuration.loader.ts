import { Injectable } from '@nestjs/common';
import {
  privacyDefaults,
  parseReminderDays,
  privacyRetentionMinimumDays,
} from '../settings/definitions/privacy-settings';
import { readInstallationTimeZone } from '../settings/read-installation-time-zone';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import type { RetentionCategory } from './privacy.constants';

export type PrivacyConfiguration = {
  readonly enabled: boolean;
  /** Days per category; 0 = disabled. */
  readonly retentionDays: Readonly<Record<RetentionCategory, number>>;
  readonly runAtLocalTime: string;
  readonly maxMinutesPerNight: number;
  readonly timeZone: string;
  readonly candidateAfterDays: number;
  readonly requireSecondApprover: boolean;
  readonly deleteOwnAttachmentsDefault: boolean;
  readonly exportIncludeAttachmentsDefault: boolean;
  readonly exportMaxAttachmentBytes: number;
  readonly exportLinkValidDays: number;
  readonly reminderDays: readonly number[];
  readonly rejectionNotice: { readonly bs: string; readonly en: string };
  readonly controller: {
    readonly name: string;
    readonly address: string;
    readonly dpoName: string;
    readonly dpoEmail: string;
    readonly purpose: string;
    readonly legalBasis: string;
  };
  readonly notice: { readonly bs: string; readonly en: string };
};

const retentionKeys: Readonly<Record<RetentionCategory, string>> = {
  attachments: settingKeys.privatePrivacyRetentionAttachmentsDays,
  ticketContent: settingKeys.privatePrivacyRetentionTicketContentDays,
  audit: settingKeys.privatePrivacyRetentionAuditDays,
  sessions: settingKeys.privatePrivacyRetentionSessionDays,
  emailDeliveries: settingKeys.privatePrivacyRetentionEmailDeliveryDays,
  requestRegister: settingKeys.privatePrivacyRetentionRequestRegisterDays,
};

const retentionDefaults: Readonly<Record<RetentionCategory, number>> = {
  attachments: 0,
  ticketContent: 0,
  audit: 0,
  sessions: privacyDefaults.sessionDays,
  emailDeliveries: privacyDefaults.emailDeliveryDays,
  requestRegister: privacyDefaults.requestRegisterDays,
};

const retentionMinimums: Readonly<Record<RetentionCategory, number>> = {
  attachments: privacyRetentionMinimumDays.attachments,
  ticketContent: privacyRetentionMinimumDays.ticketContent,
  audit: privacyRetentionMinimumDays.audit,
  sessions: privacyRetentionMinimumDays.sessions,
  emailDeliveries: privacyRetentionMinimumDays.emailDeliveries,
  requestRegister: privacyRetentionMinimumDays.requestRegister,
};

/** Paket 2.6 (§10): privacy settings with safe fallbacks (a bad value never deletes). */
@Injectable()
export class PrivacyConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<PrivacyConfiguration> {
    const read = (key: string) =>
      this.settingsService.getSetting(key as never).catch(() => undefined) as Promise<unknown>;
    const categories = Object.keys(retentionKeys) as RetentionCategory[];
    const retentionValues = await Promise.all(categories.map((category) => read(retentionKeys[category])));
    const [
      enabled,
      runAt,
      maxMinutes,
      candidateAfter,
      secondApprover,
      deleteAttachments,
      includeAttachments,
      maxAttachmentMb,
      linkValidDays,
      reminderCsv,
      rejectionBs,
      rejectionEn,
      controllerName,
      controllerAddress,
      dpoName,
      dpoEmail,
      purpose,
      legalBasis,
      noticeBs,
      noticeEn,
      timeZone,
    ] = await Promise.all([
      read(settingKeys.privatePrivacyEnabled),
      read(settingKeys.privatePrivacyRetentionRunAtLocalTime),
      read(settingKeys.privatePrivacyRetentionMaxMinutesPerNight),
      read(settingKeys.privatePrivacyAnonymizationCandidateAfterDays),
      read(settingKeys.privatePrivacyAnonymizationRequireSecondApprover),
      read(settingKeys.privatePrivacyAnonymizationDeleteOwnAttachmentsDefault),
      read(settingKeys.privatePrivacyExportIncludeAttachmentsDefault),
      read(settingKeys.privatePrivacyExportMaxAttachmentMb),
      read(settingKeys.privatePrivacyExportLinkValidDays),
      read(settingKeys.privatePrivacyRequestsReminderDaysCsv),
      read(settingKeys.privatePrivacyRequestsRejectionNoticeBs),
      read(settingKeys.privatePrivacyRequestsRejectionNoticeEn),
      read(settingKeys.privatePrivacyControllerName),
      read(settingKeys.privatePrivacyControllerAddress),
      read(settingKeys.privatePrivacyControllerDpoName),
      read(settingKeys.privatePrivacyControllerDpoEmail),
      read(settingKeys.privatePrivacyControllerPurpose),
      read(settingKeys.privatePrivacyControllerLegalBasis),
      read(settingKeys.privatePrivacyNoticeBs),
      read(settingKeys.privatePrivacyNoticeEn),
      readInstallationTimeZone(this.settingsService),
    ]);
    const retentionDays = Object.fromEntries(
      categories.map((category, index) => [
        category,
        parseRetentionDays(retentionValues[index], retentionDefaults[category], retentionMinimums[category]),
      ]),
    ) as Record<RetentionCategory, number>;
    return {
      enabled: enabled !== false,
      retentionDays,
      runAtLocalTime:
        typeof runAt === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(runAt) ? runAt : privacyDefaults.runAtLocalTime,
      maxMinutesPerNight: integerOr(maxMinutes, privacyDefaults.maxMinutesPerNight, 5, 240),
      timeZone,
      candidateAfterDays: integerOr(candidateAfter, privacyDefaults.candidateAfterDays, 30, 3650),
      requireSecondApprover: secondApprover === true,
      deleteOwnAttachmentsDefault: deleteAttachments === true,
      exportIncludeAttachmentsDefault: includeAttachments !== false,
      exportMaxAttachmentBytes:
        integerOr(maxAttachmentMb, privacyDefaults.exportMaxAttachmentMb, 10, 2000) * 1024 * 1024,
      exportLinkValidDays: integerOr(linkValidDays, privacyDefaults.exportLinkValidDays, 1, 30),
      reminderDays: safeReminderDays(reminderCsv),
      rejectionNotice: { bs: text(rejectionBs), en: text(rejectionEn) },
      controller: {
        name: text(controllerName),
        address: text(controllerAddress),
        dpoName: text(dpoName),
        dpoEmail: text(dpoEmail),
        purpose: text(purpose),
        legalBasis: text(legalBasis),
      },
      notice: { bs: text(noticeBs), en: text(noticeEn) },
    };
  }
}

/** A value below the minimum (stored before validation existed) disables the category. */
export function parseRetentionDays(value: unknown, fallback: number, minimum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return fallback;
  if (value === 0) return 0;
  return value < minimum ? 0 : value;
}

function integerOr(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeReminderDays(value: unknown): readonly number[] {
  try {
    return parseReminderDays(typeof value === 'string' ? value : privacyDefaults.reminderDaysCsv);
  } catch {
    return parseReminderDays(privacyDefaults.reminderDaysCsv);
  }
}
