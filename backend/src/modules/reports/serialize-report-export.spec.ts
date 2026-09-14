import { serializeReportCsv, serializeReportJson } from './serialize-report-export';

describe('serialize report export', () => {
  it('emits CSV headers and JSON arrays', () => {
    const rows = [{ serviceId: 'service-vpn', overdueCount: 2 }];
    expect(serializeReportCsv(['serviceId', 'overdueCount'], rows)).toBe(
      'serviceId,overdueCount\nservice-vpn,2\n',
    );
    expect(serializeReportJson(rows)).toBe(
      '[{"serviceId":"service-vpn","overdueCount":2}]\n',
    );
  });
});
