import { serializeReportCsv, serializeReportJson } from './serialize-report-export';
import { reportFileBaseName } from './serialize-report-pack-export';

describe('serialize report export', () => {
  it('emits CSV headers and JSON arrays', () => {
    const rows = [{ serviceId: 'service-vpn', overdueCount: 2 }];
    expect(serializeReportCsv(['serviceId', 'overdueCount'], rows)).toBe(
      '\uFEFFserviceId,overdueCount\r\nservice-vpn,2\r\n',
    );
    expect(serializeReportJson(rows)).toBe(
      '[{"serviceId":"service-vpn","overdueCount":2}]\n',
    );
  });

  it('neutralises formula-looking text (CSV injection) but not numbers', () => {
    const csv = serializeReportCsv(['title', 'n'], [
      { title: '=HYPERLINK("http://x")', n: -3 },
      { title: '@SUM(A1)', n: 1 },
      { title: '+1', n: 0 },
      { title: 'Štampač, sprat 2', n: 2 },
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")",-3`);
    expect(csv).toContain("'@SUM(A1),1");
    expect(csv).toContain("'+1,0");
    expect(csv).toContain('"Štampač, sprat 2",2');
  });

  it('names files after pack, unit and period', () => {
    expect(
      reportFileBaseName('monthly_kpi', {
        unitCode: 'Služba IT / Sarajevo',
        window: { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-25T10:00:00Z') },
      }),
    ).toBe('ephelpdesk_monthly_kpi_sluzba-it-sarajevo_2026-09-01_2026-09-25');
  });
});
