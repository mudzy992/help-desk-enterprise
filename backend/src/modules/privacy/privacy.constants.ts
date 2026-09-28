/** Paket 2.6: zaštita ličnih podataka (ZZLP BiH, Sl. glasnik BiH 12/25). */

export const dataSubjectRequestTypes = [
  'ACCESS',
  'PORTABILITY',
  'ERASURE',
  'RECTIFICATION',
  'RESTRICTION',
  'OBJECTION',
] as const;
export type DataSubjectRequestType = (typeof dataSubjectRequestTypes)[number];

export const dataSubjectRequestStatuses = [
  'RECEIVED',
  'IN_PROGRESS',
  'EXTENDED',
  'COMPLETED',
  'REJECTED',
] as const;
export type DataSubjectRequestStatus = (typeof dataSubjectRequestStatuses)[number];
export const closedRequestStatuses: readonly DataSubjectRequestStatus[] = ['COMPLETED', 'REJECTED'];

export const dataSubjectRequestChannels = ['EMAIL', 'PAPER', 'PORTAL', 'IN_PERSON'] as const;
export type DataSubjectRequestChannel = (typeof dataSubjectRequestChannels)[number];

/** ZZLP čl. 14(3): 30 days, extendable once by 60 days within the first 30. */
export const requestDeadlines = { answerDays: 30, extensionDays: 60 } as const;

export const erasureStatuses = [
  'PENDING_APPROVAL',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type ErasureStatus = (typeof erasureStatuses)[number];

export const exportStatuses = ['QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED'] as const;
export type ExportStatus = (typeof exportStatuses)[number];

export const retentionCategories = [
  'attachments',
  'ticketContent',
  'audit',
  'sessions',
  'emailDeliveries',
  'requestRegister',
] as const;
export type RetentionCategory = (typeof retentionCategories)[number];

/** Categories that delete business content need a dry run before the first execution. */
export const retentionCategoriesRequiringDryRun: readonly RetentionCategory[] = [
  'attachments',
  'ticketContent',
  'audit',
];

export const privacyLimits = {
  /** Rows touched per batch (retention, anonymization, export). */
  batchSize: 500,
  /** Ticket numbers stored on a retention run (the rest is counted only). */
  runRefsMax: 5000,
  /** A dry run authorises the first execution for this long. */
  dryRunValidityMs: 24 * 60 * 60 * 1000,
  /** Retention runs shown in the UI and kept (days). */
  runsListed: 50,
  runRetentionDays: 400,
  /** Four-eyes approval window. */
  approvalWindowDays: 7,
  /** Session freshness that replaces a TOTP code for users without MFA. */
  freshSessionMs: 15 * 60 * 1000,
  /** Examples of free-text replacements shown in the anonymization preview. */
  previewExamples: 3,
  /** A RUNNING job older than this is taken over (worker crashed). */
  staleJobMs: 30 * 60_000,
  requestsListed: 200,
  candidatesListed: 200,
} as const;

export const privacyQueueName = 'privacy';
export const privacyJobs = {
  retentionSweep: 'retention-sweep',
  retentionDryRun: 'retention-dry-run',
  retentionRunNow: 'retention-run-now',
  anonymize: 'anonymize-user',
  exportBuild: 'export-build',
  maintenance: 'privacy-maintenance',
} as const;
/**
 * Every 15 minutes, staggered with the other sweeps (minutes 12/27/42/57): the
 * job sends deadline reminders and checks whether the nightly local time has come.
 */
export const privacySchedulerId = 'privacy-15min';
export const privacyCronPattern = '0 12,27,42,57 * * * *';

export const privacyErrorCodes = {
  disabled: 'PRIVACY_DISABLED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  invalidInput: 'INVALID_INPUT',
  invalidTransition: 'INVALID_TRANSITION',
  extensionNotAllowed: 'EXTENSION_NOT_ALLOWED',
  identityConfirmationRequired: 'IDENTITY_CONFIRMATION_REQUIRED',
  identityConfirmationFailed: 'IDENTITY_CONFIRMATION_FAILED',
  anonymizationBlocked: 'ANONYMIZATION_BLOCKED',
  approvalRequired: 'APPROVAL_REQUIRED',
  approverMustDiffer: 'APPROVER_MUST_DIFFER',
  confirmationMismatch: 'CONFIRMATION_MISMATCH',
  exportNotReady: 'EXPORT_NOT_READY',
  exportExpired: 'EXPORT_EXPIRED',
  retentionDisabled: 'RETENTION_DISABLED',
  legalHoldActive: 'LEGAL_HOLD_ACTIVE',
  alreadyRunning: 'ALREADY_RUNNING',
} as const;
export type PrivacyErrorCode = (typeof privacyErrorCodes)[keyof typeof privacyErrorCodes];

export const privacyErrorMessages: Readonly<Record<PrivacyErrorCode, string>> = {
  PRIVACY_DISABLED: 'The privacy module is disabled',
  FORBIDDEN: 'Authorization failed',
  NOT_FOUND: 'Not found',
  INVALID_INPUT: 'Invalid input',
  INVALID_TRANSITION: 'This change is not allowed in the current state',
  EXTENSION_NOT_ALLOWED: 'The deadline can be extended once, within the first 30 days',
  IDENTITY_CONFIRMATION_REQUIRED: 'Confirm your identity (MFA code) to continue',
  IDENTITY_CONFIRMATION_FAILED: 'Identity confirmation failed',
  ANONYMIZATION_BLOCKED: 'The user cannot be anonymized',
  APPROVAL_REQUIRED: 'A second SUPER_ADMIN must approve this anonymization',
  APPROVER_MUST_DIFFER: 'The approver must be a different SUPER_ADMIN',
  CONFIRMATION_MISMATCH: 'The typed e-mail does not match the user',
  EXPORT_NOT_READY: 'The export is not ready',
  EXPORT_EXPIRED: 'The export has expired',
  RETENTION_DISABLED: 'This retention category is disabled',
  LEGAL_HOLD_ACTIVE: 'A legal hold is active',
  ALREADY_RUNNING: 'A job of this kind is already running',
};

/** Why an anonymization is refused (shown in the UI). */
export const anonymizationBlockReasons = {
  active: 'active',
  activeInDirectory: 'active_in_directory',
  superAdmin: 'super_admin',
  lastAdmin: 'last_admin',
  legalHold: 'legal_hold',
  openAssignedTickets: 'open_assigned_tickets',
  exportInProgress: 'export_in_progress',
  alreadyAnonymized: 'already_anonymized',
  erasureInProgress: 'erasure_in_progress',
  self: 'self',
} as const;
export type AnonymizationBlockReason =
  (typeof anonymizationBlockReasons)[keyof typeof anonymizationBlockReasons];
