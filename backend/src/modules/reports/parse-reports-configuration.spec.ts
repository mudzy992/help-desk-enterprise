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
    expect(parsed.enabledPacks).toEqual(Object.values(reportPackKeys).filter((pack) => !pack.startsWith('asset_') && !pack.startsWith('problem_')));
    expect(parsed.allowedFormats).toEqual(['csv', 'json']);
  });

  it('adds the CMDB packs only while the CMDB addon is on (3.2 C9b)', () => {
    const on = parseReportsConfiguration({ ...valid, packsJson: '', cmdbEnabled: true });
    expect(on.enabledPacks).toEqual(expect.arrayContaining(['asset_inventory', 'asset_expiring', 'asset_license_compliance', 'asset_top_tickets', 'asset_inactive_holders']));
    const off = parseReportsConfiguration({ ...valid, packsJson: '', cmdbEnabled: false });
    expect(off.enabledPacks.some((pack) => pack.startsWith('asset_'))).toBe(false);
  });

  it('adds the problem packs only while the problem addon is on (3.3 P6)', () => {
    const on = parseReportsConfiguration({ ...valid, packsJson: '', problemsEnabled: true });
    expect(on.enabledPacks).toEqual(expect.arrayContaining(['problem_top', 'problem_time_to_known_error', 'problem_time_to_resolution', 'problem_backlog', 'problem_recurrence']));
    const off = parseReportsConfiguration({ ...valid, packsJson: '', problemsEnabled: false });
    expect(off.enabledPacks.some((pack) => pack.startsWith('problem_'))).toBe(false);
    expect(() => parseReportsConfiguration({ ...valid, packsJson: JSON.stringify(['problem_top']) })).toThrow('REPORT_PACK_NOT_ENABLED');
  });

  it('never accepts a CMDB pack in the setting', () => {
    expect(() => parseReportsConfiguration({ ...valid, packsJson: JSON.stringify(['asset_inventory']) })).toThrow('REPORT_PACK_NOT_ENABLED');
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
