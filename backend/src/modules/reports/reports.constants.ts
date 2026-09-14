import { defaultReportPackKeys } from '../settings/definitions/reports-settings';

export const reportPackKeys = {
  monthlyKpi: 'monthly_kpi',
  overdueByService: 'overdue_by_service',
  topCloseCodes: 'top_close_codes',
  kbHelpfulness: 'kb_helpfulness',
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
  forbidden: 'FORBIDDEN',
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
  FORBIDDEN: 'Authorization failed',
};

export const bottleneckStatusKeys = [
  'PENDING_APPROVAL',
  'WAITING_FOR_USER',
  'UNROUTED',
] as const;
