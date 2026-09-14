import { reportPackKeys } from './reports.constants';
import { parseReportPackSlug } from './parse-report-pack-slug';

describe('parseReportPackSlug', () => {
  it('maps kebab slugs to pack keys', () => {
    expect(parseReportPackSlug('monthly-kpi')).toBe(reportPackKeys.monthlyKpi);
    expect(parseReportPackSlug('overdue-by-service')).toBe(
      reportPackKeys.overdueByService,
    );
  });

  it('rejects an unknown slug', () => {
    expect(() => parseReportPackSlug('semantic-search')).toThrow(
      'REPORT_PACK_NOT_ENABLED',
    );
  });
});
