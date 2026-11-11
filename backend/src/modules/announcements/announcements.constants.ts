export const announcementErrorCodes = {
  disabled: 'ANNOUNCEMENTS_DISABLED',
  notFound: 'ANNOUNCEMENT_NOT_FOUND',
  invalid: 'ANNOUNCEMENT_INVALID',
  invalidAudience: 'ANNOUNCEMENT_INVALID_AUDIENCE',
  invalidState: 'ANNOUNCEMENT_INVALID_STATE',
  versionConflict: 'ANNOUNCEMENT_VERSION_CONFLICT',
  notActive: 'ANNOUNCEMENT_NOT_ACTIVE',
  reminderTooSoon: 'ANNOUNCEMENT_REMINDER_TOO_SOON',
  reportExportTooLarge: 'ANNOUNCEMENT_REPORT_EXPORT_TOO_LARGE',
  forbidden: 'ANNOUNCEMENT_FORBIDDEN',
} as const;

export type AnnouncementErrorCode = (typeof announcementErrorCodes)[keyof typeof announcementErrorCodes];

export const announcementLimits = {
  titleMax: 120,
  bodyMax: 4000,
  audienceFilterMax: 100,
  /** Active announcements returned per viewer after DB audience matching. */
  activeMax: 50,
  /** Archive shown to the user (§3.2), after DB audience matching. */
  archiveDays: 90,
  archiveMax: 100,
  /** A reminder to those who did not acknowledge, at most once per this window (§3.3). */
  reminderIntervalMs: 24 * 60 * 60 * 1000,
  /** Maximum pending identities returned by one report API page. */
  reportPendingListed: 200,
  /** Maximum length of the opaque report-pagination cursor. */
  reportPendingCursorMaxLength: 1_024,
  /** CSV reads this many recipients per DB page and stream chunk. */
  reportCsvBatchSize: 500,
  /** Hard ceiling for one CSV export; larger reports fail before streaming PII. */
  reportCsvMaxRows: 50_000,
  /** Maximum recipients held in memory for one in-app fan-out page. */
  notifyBatchSize: 1_000,
  /** A draft may be scheduled at most this far ahead. */
  maxStartAheadDays: 366,
  manageListMax: 200,
  /** BA-announcements-14: hard bound on candidate rows scanned while paging the manage list to the caller's scope quota. */
  manageListScanMax: 5_000,
} as const;

export const announcementRoleKeys = ['USER', 'AGENT', 'ADMIN', 'SUPER_ADMIN'] as const;

export class AnnouncementError extends Error {
  constructor(
    readonly code: AnnouncementErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'AnnouncementError';
  }
}
