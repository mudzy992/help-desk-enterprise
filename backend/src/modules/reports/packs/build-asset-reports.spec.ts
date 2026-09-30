import {
  buildAssetExpiringReport,
  buildAssetInactiveHoldersReport,
  buildAssetInventoryReport,
  buildAssetLicenseComplianceReport,
  buildAssetTopTicketsReport,
  emptyAssetReportData,
  type AssetReportData,
} from './build-asset-reports';

const now = new Date('2026-10-01T08:00:00.000Z');

function data(overrides: Partial<AssetReportData>): AssetReportData {
  return { ...emptyAssetReportData, now, ...overrides };
}

describe('CMDB report packs (3.2 C9b)', () => {
  it('inventory: sorted by unit, type and status', () => {
    const rows = buildAssetInventoryReport(
      data({
        inventory: [
          { unitName: 'Zenica', typeName: 'Laptop', status: 'IN_USE', count: 4 },
          { unitName: 'Visoko', typeName: 'Monitor', status: 'IN_STOCK', count: 2 },
          { unitName: 'Visoko', typeName: 'Laptop', status: 'IN_USE', count: 7 },
        ],
      }),
    );
    expect(rows.map((row) => `${row.organizationalUnit}/${row.assetType}/${row.count}`)).toEqual(['Visoko/Laptop/7', 'Visoko/Monitor/2', 'Zenica/Laptop/4']);
  });

  it('expiring: only the next 90 days, soonest first, with days left', () => {
    const rows = buildAssetExpiringReport(
      data({
        expiring: [
          { kind: 'license', name: 'Office', reference: 'Microsoft', unitName: 'IT', endsAt: new Date('2026-12-20T00:00:00.000Z') },
          { kind: 'warranty', name: 'Laptop 1', reference: 'INV-1', unitName: 'IT', endsAt: new Date('2026-10-11T00:00:00.000Z') },
          { kind: 'contract', name: 'Servis (SUPPORT)', reference: null, unitName: 'IT', endsAt: new Date('2027-03-01T00:00:00.000Z') },
          { kind: 'warranty', name: 'Stari', reference: 'INV-0', unitName: 'IT', endsAt: new Date('2026-09-01T00:00:00.000Z') },
        ],
      }),
    );
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'warranty', endsAt: '2026-10-11', daysLeft: 10 }),
      expect.objectContaining({ kind: 'license', endsAt: '2026-12-20' }),
    ]);
  });

  it('licence compliance: over-allocated first, site licences not counted', () => {
    const rows = buildAssetLicenseComplianceReport(
      data({
        licenses: [
          { productName: 'Adobe', vendor: null, kind: 'PER_USER', unitName: 'IT', seats: 10, used: 3, validUntil: null },
          { productName: 'Windows', vendor: 'Microsoft', kind: 'PER_DEVICE', unitName: 'IT', seats: 5, used: 7, validUntil: null },
          { productName: 'Antivirus', vendor: null, kind: 'SITE', unitName: 'IT', seats: null, used: 40, validUntil: null },
        ],
      }),
    );
    expect(rows[0]).toMatchObject({ product: 'Windows', free: 0, over: 2 });
    expect(rows.find((row) => row.product === 'Antivirus')).toMatchObject({ seats: null, free: null, over: 0 });
    expect(rows.find((row) => row.product === 'Adobe')).toMatchObject({ free: 7, over: 0 });
  });

  it('top tickets: distinct tickets per asset, ranked', () => {
    const link = (assetId: string, ticketId: string, isOpen: boolean) => ({ assetId, assetTag: assetId.toUpperCase(), assetName: assetId, typeName: 'Printer', unitName: 'IT', ticketId, isOpen });
    const rows = buildAssetTopTicketsReport(data({ ticketLinks: [link('p1', 't1', true), link('p2', 't2', false), link('p2', 't3', true), link('p2', 't3', true)] }));
    expect(rows).toEqual([
      expect.objectContaining({ assetTag: 'P2', tickets: 2, openTickets: 1 }),
      expect.objectContaining({ assetTag: 'P1', tickets: 1, openTickets: 1 }),
    ]);
  });

  it('holders: deactivated users and users outside the unit subtree', () => {
    const holder = (assetTag: string, holderActive: boolean, holderUnitPath: string | null) => ({
      assetTag,
      assetName: assetTag,
      holderName: 'Amra',
      holderActive,
      holderUnitPath,
      holderUnitName: holderUnitPath,
      assetUnitPath: '/Firma/IT',
      assetUnitName: 'IT',
    });
    const rows = buildAssetInactiveHoldersReport(
      data({ holders: [holder('A', false, '/Firma/IT'), holder('B', true, '/Firma/IT/Servis'), holder('C', true, '/Firma/Nabavka'), holder('D', true, '/Firma/ITX')] }),
    );
    expect(rows.map((row) => `${row.assetTag}:${row.reason}`)).toEqual(['A:inactive', 'C:other_unit', 'D:other_unit']);
  });
});
