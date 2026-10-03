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

  it('razdvaja prozor uskih grla od prozora paketa (val 1, M15/B3)', () => {
    const split = parseReportsConfiguration({
      ...valid,
      packsJson: '',
      defaultWindowDays: 30,
      packWindowDays: 90,
    });
    expect(split.defaultWindowDays).toBe(30);
    expect(split.packWindowDays).toBe(90);

    // Bez novog ključa (starije instalacije i direktni konstruktori) paketi
    // nasljeđuju prozor uskih grla — ponašanje ostaje kompatibilno.
    expect(
      parseReportsConfiguration({ ...valid, packsJson: '' }).packWindowDays,
    ).toBe(30);

    // Neispravna vrijednost pada na prozor uskih grla, nikad na 0.
    const invalid = parseReportsConfiguration({
      ...valid,
      packsJson: '',
      packWindowDays: -5,
    });
    expect(invalid.packWindowDays).toBe(30);
  });

  it('čita CSAT skalu iz postavke, uz zadanu vrijednost 5 (val 1, M9/B3)', () => {
    const allowedPacks = { ...valid, packsJson: '' };
    expect(parseReportsConfiguration(allowedPacks).csatScaleMax).toBe(5);
    expect(
      parseReportsConfiguration({ ...allowedPacks, csatScaleMax: 10 })
        .csatScaleMax,
    ).toBe(10);
    // Van dozvoljenog opsega 2–10 ne mijenja skalu.
    for (const bad of [1, 11, 4.5, '5', null]) {
      expect(
        parseReportsConfiguration({ ...allowedPacks, csatScaleMax: bad })
          .csatScaleMax,
      ).toBe(5);
    }
  });

  it('uses the default pack set when packsJson is empty', () => {
    const parsed = parseReportsConfiguration({ ...valid, packsJson: '' });
    expect(parsed.enabledPacks).toEqual(Object.values(reportPackKeys).filter((pack) => !pack.startsWith('asset_') && !pack.startsWith('problem_') && !pack.startsWith('change_')));
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

  it('adds the change packs only while the change addon is on (3.4)', () => {
    const on = parseReportsConfiguration({ ...valid, packsJson: '', changesEnabled: true });
    expect(on.enabledPacks).toEqual(expect.arrayContaining(['change_outcomes', 'change_schedule']));
    const off = parseReportsConfiguration({ ...valid, packsJson: '', changesEnabled: false });
    expect(off.enabledPacks.some((pack) => pack.startsWith('change_'))).toBe(false);
    expect(() => parseReportsConfiguration({ ...valid, packsJson: JSON.stringify(['change_outcomes']) })).toThrow('REPORT_PACK_NOT_ENABLED');
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
