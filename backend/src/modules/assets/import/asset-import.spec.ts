import { AssetError } from '../assets.constants';
import { escapeSpreadsheetCell, parseStatusCell, suggestColumnMapping } from './asset-import-columns';
import { buildCsv, buildWorkbook } from './asset-spreadsheet';
import { parseImportDate, parseImportMoney, planAssetImport, type ExistingAsset, type ImportContext } from './plan-asset-import';
import { detectDelimiter, detectSheetFormat, parseCsv, readCsv, readXlsx } from './read-asset-sheet';

const attributes = [
  { key: 'ramGb', labelBs: 'RAM (GB)', labelEn: 'RAM (GB)' },
  { key: 'hostname', labelBs: 'Naziv računara', labelEn: 'Hostname' },
];

function context(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    typeId: 'type-laptop',
    typeKey: 'laptop',
    mode: 'CREATE_ONLY',
    autoTag: true,
    definitions: [
      { key: 'ramGb', dataType: 'NUMBER', options: null, isRequired: false, isUnique: false, archivedAt: null },
      { key: 'hostname', dataType: 'TEXT', options: null, isRequired: false, isUnique: true, archivedAt: null },
    ],
    units: [
      { id: 'u-root', name: 'Direkcija', ouPath: '/dir', distinguishedName: 'OU=Dir', inScope: true },
      { id: 'u-sa', name: 'Sarajevo', ouPath: '/dir/sa', distinguishedName: 'OU=Sa,OU=Dir', inScope: true },
      { id: 'u-x', name: 'Mostar', ouPath: '/mo', distinguishedName: 'OU=Mo', inScope: false },
      { id: 'u-d1', name: 'Pravna', ouPath: '/dir/sa/pravna', distinguishedName: 'OU=P1', inScope: true },
      { id: 'u-d2', name: 'Pravna', ouPath: '/dir/ze/pravna', distinguishedName: 'OU=P2', inScope: true },
    ],
    users: [
      { id: 'user-1', email: 'amra.h@example.com', isActive: true },
      { id: 'user-2', email: 'old@example.com', isActive: false },
    ],
    locations: [{ id: 'loc-1', name: 'Kancelarija 12', code: 'SA-12', path: 'Zgrada A › Kancelarija 12' }],
    services: [{ id: 'svc-1', name: 'ERP', slug: 'erp' }],
    existingByTag: new Map(),
    existingBySerial: new Map(),
    uniqueValues: new Map([['hostname', new Map([['pc-taken', 'asset-other']])]]),
    ...overrides,
  };
}

const existingLaptop: ExistingAsset = {
  id: 'asset-1',
  assetTag: 'INV-1',
  typeId: 'type-laptop',
  version: 3,
  source: 'MANUAL',
  inScope: true,
  name: 'Stari laptop',
  status: 'IN_STOCK',
  serialNumber: 'SN1',
  manufacturer: null,
  model: null,
  organizationalUnitId: 'u-sa',
  assignedUserId: null,
  locationId: null,
  serviceId: null,
  purchaseDate: null,
  purchaseCost: null,
  supplier: 'Dobavljač',
  warrantyEndsAt: null,
  notes: null,
  attributes: { ramGb: 8 },
};

describe('asset import columns (paket 3.2 §11)', () => {
  it('recognises headers by key, bs/en label and attribute label, ignoring case and diacritics', () => {
    expect(suggestColumnMapping(['inventarni BROJ', 'Naziv', 'Organizaciona jedinica', 'RAM (GB)', 'Naziv racunara', 'nešto', 'Name'], attributes)).toEqual([
      'assetTag',
      'name',
      'organizationalUnit',
      'attributes.ramGb',
      'attributes.hostname',
      null,
      null, // "Name" again: a key is suggested only once
    ]);
  });

  it('parses statuses in both languages and as enum keys', () => {
    expect(parseStatusCell('U upotrebi')).toBe('IN_USE');
    expect(parseStatusCell('in stock')).toBe('IN_STOCK');
    expect(parseStatusCell('IN_REPAIR')).toBe('IN_REPAIR');
    expect(parseStatusCell('pokvareno')).toBeNull();
  });

  it('neutralises formula cells on export', () => {
    expect(escapeSpreadsheetCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(escapeSpreadsheetCell('-5')).toBe(`'-5`);
    expect(escapeSpreadsheetCell('Laptop')).toBe('Laptop');
  });

  it('parses local dates and money formats', () => {
    expect(parseImportDate('1.10.2026')).toBe('2026-10-01');
    expect(parseImportDate('2026-02-30')).toBeNull();
    expect(parseImportMoney('1.234,50 KM')).toBe('1234.50');
    expect(parseImportMoney('1,234.50')).toBe('1234.50');
    expect(parseImportMoney('12,5')).toBe('12.50');
    expect(parseImportMoney('abc')).toBeNull();
  });
});

describe('sheet reading', () => {
  it('detects the delimiter and handles quotes and newlines in CSV', () => {
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a,b')).toBe(',');
    expect(parseCsv('a;"b ""x"";y"\r\n"multi\nline";2', ';')).toEqual([
      ['a', 'b "x";y'],
      ['multi\nline', '2'],
    ]);
  });

  it('keeps sheet row numbers and skips blank lines', () => {
    const sheet = readCsv(Buffer.from('\uFEFFTag;Naziv\r\nA1;Laptop\r\n;\r\nA2;PC\r\n', 'utf8'), 10);
    expect(sheet.headers).toEqual(['Tag', 'Naziv']);
    expect(sheet.rows).toEqual([
      ['A1', 'Laptop'],
      ['A2', 'PC'],
    ]);
    expect(sheet.rowNumbers).toEqual([2, 4]);
  });

  it('enforces the row limit and refuses macro workbooks', () => {
    expect(() => readCsv(Buffer.from('a\n1\n2\n3\n'), 2)).toThrow(AssetError);
    expect(() => detectSheetFormat('makro.xlsm', Buffer.from('PK\u0003\u0004'))).toThrow(AssetError);
    expect(() => detectSheetFormat('lazno.xlsx', Buffer.from('not a zip'))).toThrow(AssetError);
  });

  it('round-trips an exported workbook through the reader (escaped formulas stay text)', async () => {
    const buffer = await buildWorkbook({
      sheetName: 'Oprema',
      columns: [
        { key: 'assetTag', header: 'Inventarni broj', note: 'assetTag' },
        { key: 'name', header: 'Naziv' },
      ],
      rows: [
        ['INV-1', 'Laptop'],
        ['INV-2', '=1+1'],
      ],
      help: [{ title: 'Uputa', lines: ['x'] }],
    });
    const sheet = await readXlsx(buffer, 100);
    expect(sheet.headers).toEqual(['Inventarni broj', 'Naziv']);
    expect(sheet.rows).toEqual([
      ['INV-1', 'Laptop'],
      ['INV-2', `'=1+1`],
    ]);
  });

  it('writes CSV with BOM, CRLF and escaping', () => {
    const csv = buildCsv([{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }], [['x;y', '@cmd']], ';').toString('utf8');
    expect(csv).toBe('\uFEFFA;B\r\n"x;y";\'@cmd\r\n');
  });
});

describe('planAssetImport', () => {
  const mapping = ['assetTag', 'name', 'organizationalUnit', 'assignedUser', 'status', 'attributes.ramGb', 'attributes.hostname', 'purchaseCost'] as const;

  it('plans creates, resolves references and derives IN_USE from the user', () => {
    const plan = planAssetImport({
      mapping: [...mapping],
      rows: [['L-1', 'Laptop 1', 'Sarajevo', 'amra.h', '', '16', 'PC-1', '1.450,00']],
      rowNumbers: [2],
      context: context(),
    });
    expect(plan.errors).toEqual([]);
    expect(plan.totals).toMatchObject({ total: 1, create: 1, errors: 0 });
    expect(plan.planned[0].data).toMatchObject({
      assetTag: 'L-1',
      organizationalUnitId: 'u-sa',
      assignedUserId: 'user-1',
      status: 'IN_USE',
      purchaseCost: '1450.00',
      attributes: { ramGb: 16, hostname: 'PC-1' },
    });
  });

  it('C9c: resolves the location column only while locations are enabled', () => {
    const input = (locationsEnabled: boolean) =>
      planAssetImport({
        mapping: ['assetTag', 'name', 'organizationalUnit', 'location'],
        rows: [['L-9', 'Laptop 9', 'Sarajevo', 'nepoznato']],
        rowNumbers: [2],
        context: context({ locationsEnabled }),
      });
    expect(input(true).errors.map((error) => error.column)).toEqual(['location']);
    const off = input(false);
    expect(off.errors).toEqual([]);
    expect(off.planned[0].data.locationId).toBeNull();
  });

  it('reports clear row errors for bad references, values and duplicates', () => {
    const plan = planAssetImport({
      mapping: [...mapping],
      rows: [
        ['L-1', '', 'Pravna', 'nobody@example.com', 'Otpisano', 'mnogo', 'pc-taken', ''],
        ['L-2', 'Laptop', 'Mostar', 'old@example.com', '', '', 'PC-9', ''],
        ['L-2', 'Laptop', 'Sarajevo', '', '', '', 'pc-9', ''],
      ],
      rowNumbers: [2, 3, 4],
      context: context(),
    });
    const codes = plan.errors.map((error) => `${error.row}:${error.column}:${error.code}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        '2:name:required',
        '2:organizationalUnit:unit_ambiguous',
        '2:assignedUser:user_not_found',
        '2:status:status_not_allowed',
        '2:attributes.ramGb:attribute_number',
        '2:attributes.hostname:attribute_not_unique',
        '3:organizationalUnit:unit_out_of_scope',
        '3:assignedUser:user_inactive',
        '4:assetTag:duplicate_in_file',
        '4:attributes.hostname:duplicate_in_file',
      ]),
    );
    expect(plan.totals).toMatchObject({ create: 0, errors: 3 });
    expect(plan.errorRows).toEqual([2, 3, 4]);
  });

  it('skips existing assets in CREATE_ONLY and updates only filled cells in UPSERT', () => {
    const existing = { existingByTag: new Map([['inv-1', existingLaptop]]) };
    const createOnly = planAssetImport({ mapping: [...mapping], rows: [['INV-1', 'Novi naziv', '', '', '', '', '', '']], rowNumbers: [2], context: context(existing) });
    expect(createOnly.totals).toMatchObject({ skipped: 1, update: 0 });

    const upsert = planAssetImport({
      mapping: ['assetTag', 'name', 'supplier', 'attributes.ramGb'],
      rows: [
        ['inv-1', 'Novi naziv', '#PRAZNO', ''],
        ['INV-1', 'Novi naziv', '', ''],
      ],
      rowNumbers: [2, 3],
      context: context({ ...existing, mode: 'UPSERT' }),
    });
    expect(upsert.planned[0]).toMatchObject({ action: 'update', assetId: 'asset-1', version: 3, changes: ['name', 'supplier'] });
    expect(upsert.planned[0].data).toMatchObject({ name: 'Novi naziv', supplier: null, organizationalUnitId: 'u-sa', attributes: { ramGb: 8 } });
    // The same tag twice in one file is an error, not a second update.
    expect(upsert.errors).toEqual([{ row: 3, column: 'assetTag', code: 'duplicate_in_file', value: '2' }]);
  });

  it('counts an identical row as unchanged and refuses a tag-less row without auto numbering', () => {
    const unchanged = planAssetImport({
      mapping: ['assetTag', 'name'],
      rows: [['INV-1', 'Stari laptop']],
      rowNumbers: [2],
      context: context({ existingByTag: new Map([['inv-1', existingLaptop]]), mode: 'UPSERT' }),
    });
    expect(unchanged.totals).toMatchObject({ unchanged: 1, update: 0 });
    const noTag = planAssetImport({ mapping: ['name', 'organizationalUnit'], rows: [['Laptop', 'Sarajevo']], rowNumbers: [2], context: context({ autoTag: false }) });
    expect(noTag.errors[0]).toMatchObject({ column: 'assetTag', code: 'tag_required' });
  });

  it('matches by serial number within the type when the tag is empty', () => {
    const plan = planAssetImport({
      mapping: ['serialNumber', 'status'],
      rows: [['sn1', 'Na servisu']],
      rowNumbers: [2],
      context: context({ existingBySerial: new Map([['sn1', existingLaptop]]), mode: 'UPSERT' }),
    });
    expect(plan.planned[0]).toMatchObject({ action: 'update', assetId: 'asset-1', changes: ['status'] });
  });
});
