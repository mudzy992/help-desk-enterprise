export const announcementErrorCodes = {
  disabled: 'ANNOUNCEMENTS_DISABLED',
  notFound: 'ANNOUNCEMENT_NOT_FOUND',
  invalid: 'ANNOUNCEMENT_INVALID',
  invalidAudience: 'ANNOUNCEMENT_INVALID_AUDIENCE',
  invalidState: 'ANNOUNCEMENT_INVALID_STATE',
  notActive: 'ANNOUNCEMENT_NOT_ACTIVE',
  reminderTooSoon: 'ANNOUNCEMENT_REMINDER_TOO_SOON',
  forbidden: 'ANNOUNCEMENT_FORBIDDEN',
} as const;

export type AnnouncementErrorCode = (typeof announcementErrorCodes)[keyof typeof announcementErrorCodes];

export const announcementLimits = {
  titleMax: 120,
  bodyMax: 4000,
  audienceFilterMax: 100,
  /** Archive shown to the user (§3.2). */
  archiveDays: 90,
  archiveMax: 100,
  /** A reminder to those who did not acknowledge, at most once per this window (§3.3). */
  reminderIntervalMs: 24 * 60 * 60 * 1000,
  /** Names listed in the report (the CSV has everyone). */
  reportPendingListed: 200,
  /** Largest audience notified in one go (in-app notifications are rows). */
  notifyMaxRecipients: 20_000,
  /** A draft may be scheduled at most this far ahead. */
  maxStartAheadDays: 366,
  manageListMax: 200,
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
