import { reportErrorCodes, reportPackSlugs } from './reports.constants';
import type { ReportPackKey } from './reports.constants';
import { ReportsError } from './reports.error';

const packSlugToKey: Readonly<Record<string, ReportPackKey>> = Object.fromEntries(
  Object.entries(reportPackSlugs).map(([key, slug]) => [slug, key as ReportPackKey]),
);

export function parseReportPackSlug(packSlug: string): ReportPackKey {
  const pack = packSlugToKey[packSlug];
  if (pack === undefined) {
    throw new ReportsError(reportErrorCodes.packNotEnabled);
  }
  return pack;
}
