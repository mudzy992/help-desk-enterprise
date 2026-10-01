import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from '../helpers/a11y';
import { ApiClient } from '../helpers/api-client';
import {
  assetSettingKeys,
  createAsset,
  errorCode,
  findAssignableUser,
  firstUnit,
  pickAssetType,
  retireAssets,
  uniqueStamp,
  withSettings,
} from '../helpers/assets';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type ImportTotals = { total: number; create: number; update: number; unchanged: number; skipped: number; errors: number; duplicateSkipped?: number };
type ImportPreview = { id: string; status: 'PREVIEW'; totals: ImportTotals; errorCount: number; errors: ReadonlyArray<{ row: number; column: string | null; code: string }> };
type ImportApplied = { id: string; status: 'APPLIED' | 'FAILED'; applied: number };
type AssetRow = { id: string; assetTag: string; name: string; status: string; assignedUser?: { id: string } | null; assignedUserId?: string | null };

const settings = { [assetSettingKeys.cmdb]: true, [assetSettingKeys.transferEnabled]: false, [assetSettingKeys.transferRequired]: false };
const mapping = JSON.stringify(['assetTag', 'name', 'organizationalUnit']);

function csvFile(lines: readonly string[], fileName = 'e2e-import.csv'): { blob: Blob; fileName: string } {
  // UTF-8 with BOM and ";" like Excel exports in bs locale.
  return { blob: new Blob([`\uFEFF${lines.join('\r\n')}\r\n`], { type: 'text/csv' }), fileName };
}

async function preview(api: ApiClient, typeId: string, file: { blob: Blob; fileName: string }, mode: 'CREATE_ONLY' | 'UPSERT', allOrNothing: boolean): Promise<Response> {
  const form = new FormData();
  form.append('file', file.blob, file.fileName);
  form.append('typeId', typeId);
  form.append('mode', mode);
  form.append('allOrNothing', String(allOrNothing));
  form.append('mapping', mapping);
  return api.request('/assets/import/preview', { method: 'POST', body: form });
}

async function listByStamp(api: ApiClient, stamp: string): Promise<AssetRow[]> {
  const page = await api.requestJson<{ items: AssetRow[] } | AssetRow[]>(`/assets?search=${encodeURIComponent(stamp)}&limit=50`);
  return Array.isArray(page) ? page : page.items;
}

/**
 * Paket 3.2 §11 + §13 + bulk moves: Excel/CSV import with preview,
 * all-or-nothing, the error workbook, duplicate protection and upsert;
 * export of the current filter; selecting several items for one move.
 */
test.describe('27 assets import, export and bulk', () => {
  test('API: import preview, all-or-nothing, apply, duplicate file, upsert and export', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const stamp = uniqueStamp();
    let typeId: string | null = null;
    const created: string[] = [];
    await withSettings(admin, settings, 'E2E 27 import', async () => {
      try {
        // Own type without attributes, so required attributes elsewhere cannot interfere.
        const type = await admin.requestJson<{ id: string }>('/assets/catalog/types', {
          method: 'POST',
          body: JSON.stringify({
            key: `e2e-import-${stamp}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 48),
            nameBs: `E2E uvoz ${stamp}`,
            nameEn: `E2E import ${stamp}`,
            icon: 'package',
            category: 'OTHER',
            isUserSelectable: false,
            sortOrder: 9001,
          }),
        });
        typeId = type.id;
        const unit = await firstUnit(admin);
        const tagA = `E2E-IA-${stamp}`;
        const tagB = `E2E-IB-${stamp}`;
        const header = 'Inventurni broj;Naziv;Organizaciona jedinica';
        const withError = csvFile([header, `${tagA};E2E uvoz A ${stamp};${unit.path}`, `${tagB};E2E uvoz B ${stamp};${unit.path}`, `E2E-IX-${stamp};;${unit.path}`]);

        // Wrong extension is refused before anything else.
        const xls = await preview(admin, type.id, { blob: withError.blob, fileName: 'e2e.xls' }, 'CREATE_ONLY', false);
        expect(xls.status).toBe(400);
        expect(await errorCode(xls)).toBe('ASSET_IMPORT_FILE_INVALID');

        // All-or-nothing with one bad row: preview shows it, apply refuses, error workbook is offered.
        const strictResponse = await preview(admin, type.id, withError, 'CREATE_ONLY', true);
        expect(strictResponse.status).toBe(200);
        const strict = (await strictResponse.json()) as ImportPreview;
        expect(strict.totals).toMatchObject({ total: 3, create: 2, errors: 1 });
        expect(strict.errors[0]).toMatchObject({ column: 'name', code: 'required' });
        const refused = await admin.request(`/assets/import/${strict.id}/apply`, { method: 'POST' });
        expect(await errorCode(refused)).toBe('ASSET_IMPORT_HAS_ERRORS');
        const workbook = await admin.request(`/assets/import/${strict.id}/errors?locale=bs`);
        expect(workbook.status).toBe(200);
        expect(Buffer.from(await workbook.arrayBuffer()).subarray(0, 2).toString('latin1')).toBe('PK');
        const discarded = await admin.requestJson<{ discarded: boolean }>(`/assets/import/${strict.id}`, { method: 'DELETE' });
        expect(discarded.discarded).toBe(true);
        await expect(listByStamp(admin, stamp)).resolves.toHaveLength(0);

        // Partial import: the good rows go in, the bad one is reported.
        const loose = (await (await preview(admin, type.id, withError, 'CREATE_ONLY', false)).json()) as ImportPreview;
        const applied = await admin.requestJson<ImportApplied>(`/assets/import/${loose.id}/apply`, { method: 'POST' });
        expect(applied).toMatchObject({ status: 'APPLIED', applied: 2 });
        const rows = await listByStamp(admin, stamp);
        created.push(...rows.map((row) => row.id));
        expect(rows.map((row) => row.assetTag).sort()).toEqual([tagA, tagB].sort());
        const again = await admin.request(`/assets/import/${loose.id}/apply`, { method: 'POST' });
        expect(await errorCode(again)).toBe('ASSET_IMPORT_NOT_PENDING');

        // The same file again in "create only" creates nothing new.
        const duplicate = (await (await preview(admin, type.id, withError, 'CREATE_ONLY', false)).json()) as ImportPreview;
        expect(duplicate.totals.create).toBe(0);
        await admin.request(`/assets/import/${duplicate.id}`, { method: 'DELETE' });

        // Upsert by tag: one renamed, one unchanged.
        const renamed = `E2E uvoz A izmijenjen ${stamp}`;
        const upsertFile = csvFile([header, `${tagA};${renamed};${unit.path}`, `${tagB};E2E uvoz B ${stamp};${unit.path}`], 'e2e-upsert.csv');
        const upsert = (await (await preview(admin, type.id, upsertFile, 'UPSERT', true)).json()) as ImportPreview;
        expect(upsert.totals).toMatchObject({ total: 2, create: 0, update: 1, unchanged: 1, errors: 0 });
        await admin.requestJson<ImportApplied>(`/assets/import/${upsert.id}/apply`, { method: 'POST' });
        expect((await listByStamp(admin, stamp)).find((row) => row.assetTag === tagA)?.name).toBe(renamed);

        // Export of the current filter, CSV and XLSX.
        const csv = await admin.request(`/assets/export?format=csv&locale=bs&search=${encodeURIComponent(stamp)}`);
        expect(csv.status).toBe(200);
        expect(csv.headers.get('content-type') ?? '').toContain('text/csv');
        const csvText = await csv.text();
        expect(csvText).toContain(tagA);
        expect(csvText).toContain(tagB);
        expect(csvText).toContain(renamed);
        const xlsx = await admin.request(`/assets/export?format=xlsx&locale=en&search=${encodeURIComponent(stamp)}`);
        expect(xlsx.status).toBe(200);
        expect(Buffer.from(await xlsx.arrayBuffer()).subarray(0, 2).toString('latin1')).toBe('PK');

        // A plain user can neither import nor export.
        const plain = new ApiClient();
        await plain.login(env.userEmail, env.userPassword);
        expect([403, 404]).toContain((await plain.request('/assets/export?format=csv')).status);
        expect([403, 404]).toContain((await preview(plain, type.id, upsertFile, 'UPSERT', false)).status);
      } finally {
        if (created.length === 0) created.push(...(await listByStamp(admin, stamp).catch(() => [])).map((row) => row.id));
        await retireAssets(admin, created, 'E2E 27 cleanup');
        if (typeId !== null) {
          await admin.request(`/assets/catalog/types/${typeId}/archive`, { method: 'POST', body: JSON.stringify({ archived: true }) }).catch(() => undefined);
        }
      }
    });
  });

  test('UI: select two items from stock and assign them in one move; import tab is accessible', async ({ page }, testInfo) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    await withSettings(admin, settings, 'E2E 27 bulk', async () => {
      try {
        const type = await pickAssetType(admin);
        const unit = await firstUnit(admin);
        const stamp = uniqueStamp();
        const first = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E bulk A ${stamp}`, assetTag: `E2E-BA-${stamp}` });
        const second = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E bulk B ${stamp}`, assetTag: `E2E-BB-${stamp}` });
        created.push(first.id, second.id);
        const user = await findAssignableUser(admin, env.userEmail);

        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        await page.goto('/assets');
        await expect(page.getByRole('button', { name: /Nova stavka|New asset/ })).toBeEnabled({ timeout: 15_000 });
        await page.getByRole('search').getByRole('searchbox').fill(stamp);
        for (const asset of [first, second]) {
          await page.getByRole('checkbox', { name: new RegExp(asset.assetTag) }).check({ timeout: 15_000 });
        }
        const bar = page.getByRole('region', { name: /Odabrana oprema|Selected equipment/ });
        await expect(bar).toContainText(/2/);
        await expectNoSeriousA11yViolations(page, 'assets-bulk-selection', testInfo);
        await bar.getByRole('button', { name: /^(Zaduži|Assign)$/ }).click();

        const sheet = page.getByRole('dialog');
        await sheet.getByLabel(/^(Korisnik|User)/).fill(env.userEmail.split('@')[0]);
        await sheet.getByRole('radio', { name: new RegExp(env.userEmail.replace(/[.]/g, '\\.')) }).check();
        await sheet.getByRole('button', { name: /^(Zaduži|Assign)$/ }).click();

        await expect
          .poll(async () => {
            const rows = await listByStamp(admin, stamp);
            return rows.filter((row) => row.status === 'IN_USE' && (row.assignedUser?.id ?? row.assignedUserId) === user.id).length;
          }, { timeout: 15_000 })
          .toBe(2);

        await page.goto('/assets?tab=import');
        await expect(page.getByRole('heading', { name: /Uvoz iz Excel\/CSV tabele|Import from/ })).toBeVisible({ timeout: 15_000 });
        await expectNoSeriousA11yViolations(page, 'assets-import-tab', testInfo);
      } finally {
        await retireAssets(admin, created, 'E2E 27 cleanup');
      }
    });
  });
});
