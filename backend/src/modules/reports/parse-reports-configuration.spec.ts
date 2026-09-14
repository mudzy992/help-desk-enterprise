import { reportPackKeys } from './reports.constants';
import { parseReportsConfiguration } from './parse-reports-configuration';

describe('parseReportsConfiguration', () => {
  const valid = {
    reportsEnabled: true,
    addonEnabled: true,
    packsJson: JSON.stringify(Object.values(reportPackKeys)),
    allowedFormatsCsv: 'csv,json',
    bottlenecksEnabled: true,
    defaultWindowDays: 30,
  };

  it('uses the default pack set when packsJson is empty', () => {
    const parsed = parseReportsConfiguration({ ...valid, packsJson: '' });
    expect(parsed.enabledPacks).toEqual(Object.values(reportPackKeys));
    expect(parsed.allowedFormats).toEqual(['csv', 'json']);
  });

  it('rejects an unknown pack key', () => {
    expect(() =>
      parseReportsConfiguration({
        ...valid,
        packsJson: JSON.stringify(['monthly_kpi', 'unknown']),
      }),
    ).toThrow('REPORT_PACK_NOT_ENABLED');
  });
});
