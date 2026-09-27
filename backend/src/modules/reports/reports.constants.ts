import { defaultReportPackKeys } from '../settings/definitions/reports-settings';

export const reportPackKeys = {
  monthlyKpi: 'monthly_kpi',
  overdueByService: 'overdue_by_service',
  topCloseCodes: 'top_close_codes',
  kbHelpfulness: 'kb_helpfulness',
  forwardPingPong: 'forward_ping_pong',
  timeTracking: 'time_tracking',
} as const satisfies Record<string, (typeof defaultReportPackKeys)[number]>;

export const reportPackKeyList = Object.values(reportPackKeys);

export type ReportPackKey = (typeof reportPackKeyList)[number];

export const allowedReportExportFormats = ['csv', 'json'] as const;

export type ReportExportFormat = (typeof allowedReportExportFormats)[number];

export const reportErrorCodes = {
  disabled: 'REPORTS_DISABLED',
  bottlenecksDisabled: 'BOTTLENECKS_DISABLED',
  formatNotAllowed: 'REPORT_FORMAT_NOT_ALLOWED',
  packNotEnabled: 'REPORT_PACK_NOT_ENABLED',
  windowInvalid: 'REPORT_WINDOW_INVALID',
  organizationalUnitNotFound: 'REPORT_ORGANIZATIONAL_UNIT_NOT_FOUND',
  tooLarge: 'REPORT_TOO_LARGE',
  forbidden: 'FORBIDDEN',
  // Paket 2.5
  trendsDisabled: 'REPORT_TRENDS_DISABLED',
  scheduleDisabled: 'REPORT_SCHEDULE_DISABLED',
  scheduleNotFound: 'REPORT_SCHEDULE_NOT_FOUND',
  scheduleLimit: 'REPORT_SCHEDULE_LIMIT',
  scheduleInvalid: 'REPORT_SCHEDULE_INVALID',
  recipientInvalid: 'REPORT_RECIPIENT_INVALID',
  recipientLimit: 'REPORT_RECIPIENT_LIMIT',
} as const;

export type ReportErrorCode =
  (typeof reportErrorCodes)[keyof typeof reportErrorCodes];

export const reportErrorMessages: Record<ReportErrorCode, string> = {
  REPORTS_DISABLED: 'Report packs are disabled',
  BOTTLENECKS_DISABLED: 'Bottleneck dashboard is disabled',
  REPORT_FORMAT_NOT_ALLOWED: 'The requested report export format is not allowed',
  REPORT_PACK_NOT_ENABLED: 'The requested report pack is not enabled',
  REPORT_WINDOW_INVALID: 'The requested report window is invalid',
  REPORT_ORGANIZATIONAL_UNIT_NOT_FOUND:
    'The requested organizational unit was not found',
  REPORT_TOO_LARGE:
    'The report has too many rows; choose a shorter period or a narrower unit',
  FORBIDDEN: 'Authorization failed',
  REPORT_TRENDS_DISABLED: 'The trends dashboard is disabled',
  REPORT_SCHEDULE_DISABLED: 'Scheduled reports are disabled',
  REPORT_SCHEDULE_NOT_FOUND: 'The report schedule was not found',
  REPORT_SCHEDULE_LIMIT: 'The maximum number of report schedules has been reached',
  REPORT_SCHEDULE_INVALID: 'The report schedule is not valid',
  REPORT_RECIPIENT_INVALID: 'A recipient may not receive this report',
  REPORT_RECIPIENT_LIMIT: 'Too many recipients for one report schedule',
};

/** Package 1.6 limits (plan §3 D3/D5). */
export const reportPackLimits = {
  previewRows: 200,
  exportRows: 50_000,
  maxWindowDays: 366,
} as const;

/** URL slugs, in display order. */
export const reportPackSlugs: Readonly<Record<ReportPackKey, string>> = {
  monthly_kpi: 'monthly-kpi',
  overdue_by_service: 'overdue-by-service',
  top_close_codes: 'top-close-codes',
  kb_helpfulness: 'kb-helpfulness',
  forward_ping_pong: 'forward-ping-pong',
  time_tracking: 'time-tracking',
};

export const bottleneckStatusKeys = [
  'PENDING_APPROVAL',
  'WAITING_FOR_USER',
  'UNROUTED',
] as const;
