import {
  allowedReportExportFormats,
  reportErrorCodes,
  reportPackKeyList,
  type ReportExportFormat,
  type ReportPackKey,
} from './reports.constants';
import {
  defaultBottleneckWindowDays,
  defaultReportExportFormatsCsv,
  defaultReportPacksJson,
} from '../settings/definitions/reports-settings';
import { ReportsError } from './reports.error';
import type { ReportsConfiguration } from './reports.types';

export function parseReportsConfiguration(input: {
  readonly reportsEnabled: unknown;
  readonly addonEnabled: unknown;
  readonly packsJson: unknown;
  readonly allowedFormatsCsv: unknown;
  readonly bottlenecksEnabled: unknown;
  readonly defaultWindowDays: unknown;
}): ReportsConfiguration {
  if (
    typeof input.reportsEnabled !== 'boolean' ||
    typeof input.addonEnabled !== 'boolean' ||
    typeof input.bottlenecksEnabled !== 'boolean'
  ) {
    throw new ReportsError(reportErrorCodes.disabled);
  }
  return {
    reportsEnabled: input.reportsEnabled,
    addonEnabled: input.addonEnabled,
    enabledPacks: parsePacks(
      typeof input.packsJson === 'string' ? input.packsJson : '',
    ),
    allowedFormats: parseFormats(
      typeof input.allowedFormatsCsv === 'string'
        ? input.allowedFormatsCsv
        : defaultReportExportFormatsCsv,
    ),
    bottlenecksEnabled: input.bottlenecksEnabled,
    defaultWindowDays: parseWindowDays(input.defaultWindowDays),
  };
}

function parsePacks(value: string): readonly ReportPackKey[] {
  const source = value.trim().length === 0 ? defaultReportPacksJson : value;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new ReportsError(reportErrorCodes.packNotEnabled);
  }
  if (!Array.isArray(parsed)) {
    throw new ReportsError(reportErrorCodes.packNotEnabled);
  }
  const allowed = new Set<string>(reportPackKeyList);
  const packs = [
    ...new Set(
      parsed.filter((item): item is string => typeof item === 'string'),
    ),
  ];
  if (packs.length === 0 || packs.some((pack) => !allowed.has(pack))) {
    throw new ReportsError(reportErrorCodes.packNotEnabled);
  }
  return packs as ReportPackKey[];
}

function parseFormats(value: string): readonly ReportExportFormat[] {
  const source =
    value.trim().length === 0 ? defaultReportExportFormatsCsv : value;
  const formats = [
    ...new Set(
      source
        .split(',')
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length > 0),
    ),
  ];
  const allowed = new Set<string>(allowedReportExportFormats);
  if (formats.length === 0 || formats.some((format) => !allowed.has(format))) {
    throw new ReportsError(reportErrorCodes.formatNotAllowed);
  }
  return formats as ReportExportFormat[];
}

function parseWindowDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return defaultBottleneckWindowDays;
  }
  return value;
}
