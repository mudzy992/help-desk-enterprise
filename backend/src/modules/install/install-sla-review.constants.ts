export const installSlaReviewConstants = {
  changeLogReason: 'install_wizard',
} as const;

export const installSlaReviewErrorCodes = {
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
  /** No starting business-hours calendar: the SLA seeder has not run yet. */
  calendarMissing: 'SLA_REVIEW_CALENDAR_MISSING',
  /** „adjusted“ without a single change would be a lie in the status. */
  emptyAdjustment: 'SLA_REVIEW_EMPTY_ADJUSTMENT',
} as const;
