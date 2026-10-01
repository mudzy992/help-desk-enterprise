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

type CatalogWithAttributes = {
  readonly types: ReadonlyArray<{ readonly id: string; readonly attributes?: ReadonlyArray<{ readonly id: string; readonly key: string }> }>;
};
type License = {
  readonly id: string;
  readonly hasKey: boolean;
  readonly used: number;
  readonly seats: number | null;
  readonly available: number | null;
  readonly overAllocated: boolean;
  readonly assignments: ReadonlyArray<{ readonly id: string; readonly asset: { id: string } | null; readonly user: { id: string } | null }>;
};
type Contract = { readonly id: string; readonly items: ReadonlyArray<{ readonly id: string }> };
type AssetDetail = { readonly id: string; readonly attributes?: Record<string, unknown>; readonly licenses: readonly unknown[]; readonly contracts: ReadonlyArray<{ readonly id: string }> };
type Impact = {
  readonly dependents: { readonly items: ReadonlyArray<{ readonly assetId: string }>; readonly hidden: number };
  readonly dependencies: { readonly items: ReadonlyArray<{ readonly assetId: string }>; readonly hidden: number };
};

const settings = { [assetSettingKeys.cmdb]: true, [assetSettingKeys.transferEnabled]: false, [assetSettingKeys.transferRequired]: false };

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function historyActions(api: ApiClient, assetId: string): Promise<string[]> {
  const history = await api.requestJson<ReadonlyArray<{ action: string }> | { items: ReadonlyArray<{ action: string }> }>(`/assets/${assetId}/history`);
  return (Array.isArray(history) ? history : (history as { items: ReadonlyArray<{ action: string }> }).items).map((row) => row.action);
}

/**
 * Paket 3.2 §5, §6, §9, §10: the type catalog with its own attributes,
 * relations with impact and cycle protection, software licences with seats
 * and the encrypted key, warranty/support contracts — and the screens.
 */
test.describe('28 assets catalog, relations, licences and contracts', () => {
  test('catalog: custom type with required, unique and select attributes', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const stamp = uniqueStamp();
    let typeId: string | null = null;
    const created: string[] = [];
    await withSettings(admin, settings, 'E2E 28 catalog', async () => {
      try {
        const type = await admin.requestJson<{ id: string }>('/assets/catalog/types', {
          method: 'POST',
          body: JSON.stringify({
            key: `e2e-catalog-${stamp}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 48),
            nameBs: `E2E katalog ${stamp}`,
            nameEn: `E2E catalog ${stamp}`,
            icon: 'box',
            category: 'HARDWARE',
            isUserSelectable: false,
            sortOrder: 9002,
          }),
        });
        typeId = type.id;
        const attribute = (body: Record<string, unknown>) =>
          admin.request(`/assets/catalog/types/${type.id}/attributes`, { method: 'POST', body: JSON.stringify({ isRequired: false, isUnique: false, sortOrder: 0, ...body }) });
        expect((await attribute({ key: 'inventoryCode', labelBs: 'Šifra', labelEn: 'Code', dataType: 'TEXT', isRequired: true, isUnique: true })).ok).toBe(true);
        expect((await attribute({ key: 'colour', labelBs: 'Boja', labelEn: 'Colour', dataType: 'SELECT', options: ['crna', 'bijela'] })).ok).toBe(true);
        const duplicateKey = await attribute({ key: 'colour', labelBs: 'Boja 2', labelEn: 'Colour 2', dataType: 'TEXT' });
        expect(await errorCode(duplicateKey)).toBe('ASSET_ATTRIBUTE_KEY_TAKEN');
        const badKey = await attribute({ key: 'Bad-Key', labelBs: 'X', labelEn: 'X', dataType: 'TEXT' });
        expect(await errorCode(badKey)).toBe('ASSET_INVALID');

        const unit = await firstUnit(admin);
        const base = { typeId: type.id, organizationalUnitId: unit.id, status: 'IN_STOCK' };
        const missing = await admin.request('/assets', { method: 'POST', body: JSON.stringify({ ...base, name: `E2E no code ${stamp}`, assetTag: `E2E-CM-${stamp}`, attributes: {} }) });
        expect(await errorCode(missing)).toBe('ASSET_ATTRIBUTE_INVALID');
        const wrongOption = await admin.request('/assets', {
          method: 'POST',
          body: JSON.stringify({ ...base, name: `E2E bad option ${stamp}`, assetTag: `E2E-CO-${stamp}`, attributes: { inventoryCode: `X-${stamp}`, colour: 'zelena' } }),
        });
        expect(await errorCode(wrongOption)).toBe('ASSET_ATTRIBUTE_INVALID');
        const ok = await createAsset(admin, { ...base, name: `E2E with code ${stamp}`, assetTag: `E2E-C1-${stamp}`, attributes: { inventoryCode: `K-${stamp}`, colour: 'crna' } });
        created.push(ok.id);
        const detail = await admin.requestJson<AssetDetail>(`/assets/${ok.id}`);
        expect(JSON.stringify(detail.attributes ?? detail)).toContain(`K-${stamp}`);
        const clash = await admin.request('/assets', {
          method: 'POST',
          body: JSON.stringify({ ...base, name: `E2E same code ${stamp}`, assetTag: `E2E-C2-${stamp}`, attributes: { inventoryCode: `K-${stamp}` } }),
        });
        expect(await errorCode(clash)).toBe('ASSET_ATTRIBUTE_NOT_UNIQUE');

        // Changing the data type of an attribute that already holds values is refused.
        const catalog = await admin.requestJson<CatalogWithAttributes>('/assets/catalog?includeArchived=true');
        const code = catalog.types.find((entry) => entry.id === type.id)?.attributes?.find((entry) => entry.key === 'inventoryCode');
        expect(code, 'attribute listed in the catalog').toBeTruthy();
        const retype = await admin.request(`/assets/catalog/attributes/${code!.id}`, {
          method: 'PUT',
          body: JSON.stringify({ key: 'inventoryCode', labelBs: 'Šifra', labelEn: 'Code', dataType: 'NUMBER', isRequired: true, isUnique: true, sortOrder: 0 }),
        });
        expect(await errorCode(retype)).toBe('ASSET_ATTRIBUTE_HAS_VALUES');

        // Only catalog admins edit types.
        const agent = new ApiClient();
        await agent.login(env.agentEmail, env.agentPassword);
        const denied = await agent.request('/assets/catalog/types', {
          method: 'POST',
          body: JSON.stringify({ nameBs: 'X', nameEn: 'X', icon: 'box', category: 'OTHER', isUserSelectable: false, sortOrder: 0 }),
        });
        expect([403, 404]).toContain(denied.status);
      } finally {
        await retireAssets(admin, created, 'E2E 28 cleanup');
        if (typeId !== null) await admin.request(`/assets/catalog/types/${typeId}/archive`, { method: 'POST', body: JSON.stringify({ archived: true }) }).catch(() => undefined);
      }
    });
  });

  test('relations: impact both ways, no self, no duplicate, no cycle', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    await withSettings(admin, settings, 'E2E 28 relations', async () => {
      try {
        const type = await pickAssetType(admin);
        const unit = await firstUnit(admin);
        const stamp = uniqueStamp();
        const make = async (suffix: string) => {
          const asset = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E rel ${suffix} ${stamp}`, assetTag: `E2E-R${suffix}-${stamp}` });
          created.push(asset.id);
          return asset;
        };
        const server = await make('S');
        const app = await make('A');
        const client = await make('C');
        const relate = (from: string, to: string, kind = 'DEPENDS_ON') =>
          admin.request(`/assets/${from}/relations`, { method: 'POST', body: JSON.stringify({ toAssetId: to, kind }) });

        // client → app → server
        const first = await relate(app.id, server.id);
        expect(first.ok).toBe(true);
        const firstRelation = (await first.json()) as { id: string };
        expect((await relate(client.id, app.id)).ok).toBe(true);
        expect(await errorCode(await relate(app.id, app.id))).toBe('ASSET_RELATION_SELF');
        expect(await errorCode(await relate(app.id, server.id))).toBe('ASSET_RELATION_EXISTS');
        expect(await errorCode(await relate(server.id, client.id))).toBe('ASSET_RELATION_CYCLE');
        // Undirected kinds may point back.
        expect((await relate(server.id, client.id, 'CONNECTED_TO')).ok).toBe(true);

        const impact = await admin.requestJson<Impact>(`/assets/${server.id}/impact`);
        const dependents = impact.dependents.items.map((node) => node.assetId);
        expect(dependents).toEqual(expect.arrayContaining([app.id, client.id]));
        const clientImpact = await admin.requestJson<Impact>(`/assets/${client.id}/impact`);
        expect(clientImpact.dependencies.items.map((node) => node.assetId)).toEqual(expect.arrayContaining([app.id, server.id]));
        expect(await historyActions(admin, server.id)).toContain('relation_added');

        const removed = await admin.request(`/assets/${app.id}/relations/${firstRelation.id}`, { method: 'DELETE' });
        expect(removed.ok).toBe(true);
        const after = await admin.requestJson<Impact>(`/assets/${server.id}/impact`);
        expect(after.dependents.items.map((node) => node.assetId)).not.toContain(app.id);
        expect(await historyActions(admin, server.id)).toContain('relation_removed');
      } finally {
        await retireAssets(admin, created, 'E2E 28 cleanup');
      }
    });
  });

  test('licences and contracts: seats, over-allocation, key, coverage on the asset', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    const licenses: string[] = [];
    const contracts: string[] = [];
    await withSettings(admin, settings, 'E2E 28 licences', async () => {
      try {
        const type = await pickAssetType(admin);
        const unit = await firstUnit(admin);
        const stamp = uniqueStamp();
        const first = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E lic A ${stamp}`, assetTag: `E2E-LA-${stamp}` });
        const second = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E lic B ${stamp}`, assetTag: `E2E-LB-${stamp}` });
        created.push(first.id, second.id);
        const user = await findAssignableUser(admin, env.userEmail);

        // Validation: per-device needs seats, subscription needs an end date.
        const noSeats = await admin.request('/assets/licenses', { method: 'POST', body: JSON.stringify({ productName: 'X', kind: 'PER_DEVICE', organizationalUnitId: unit.id }) });
        expect(await errorCode(noSeats)).toBe('ASSET_INVALID');
        const noEnd = await admin.request('/assets/licenses', { method: 'POST', body: JSON.stringify({ productName: 'X', kind: 'SUBSCRIPTION', seats: 5, organizationalUnitId: unit.id }) });
        expect(await errorCode(noEnd)).toBe('ASSET_INVALID');

        // One seat, with a key if the installation has the key cipher configured.
        const licenseBody = { productName: `E2E Office ${stamp}`, vendor: 'E2E Vendor', kind: 'PER_DEVICE', seats: 1, validUntil: inDays(200), organizationalUnitId: unit.id };
        const secret = `E2E-KEY-${stamp}`;
        let response = await admin.request('/assets/licenses', { method: 'POST', body: JSON.stringify({ ...licenseBody, licenseKey: secret }) });
        let keyStored = true;
        if (!response.ok && (await errorCode(response.clone())) === 'ASSET_LICENSE_KEY_UNAVAILABLE') {
          keyStored = false;
          test.info().annotations.push({ type: 'skipped-part', description: 'Licence key cipher not configured; key storage not tested.' });
          response = await admin.request('/assets/licenses', { method: 'POST', body: JSON.stringify(licenseBody) });
        }
        expect(response.ok).toBe(true);
        let license = (await response.json()) as License;
        licenses.push(license.id);
        expect(license.hasKey).toBe(keyStored);
        expect(JSON.stringify(license)).not.toContain(secret);
        if (keyStored) {
          const revealed = await admin.requestJson<{ licenseKey: string }>(`/assets/licenses/${license.id}/key`, { method: 'POST' });
          expect(revealed.licenseKey).toBe(secret);
        }

        // Per-device licence: assets only; two assets on one seat = over-allocated but allowed.
        const toUser = await admin.request(`/assets/licenses/${license.id}/assignments`, { method: 'POST', body: JSON.stringify({ userId: user.id }) });
        expect(await errorCode(toUser)).toBe('ASSET_LICENSE_ASSIGNMENT_INVALID');
        license = await admin.requestJson<License>(`/assets/licenses/${license.id}/assignments`, { method: 'POST', body: JSON.stringify({ assetId: first.id }) });
        expect(license).toMatchObject({ used: 1, seats: 1, available: 0, overAllocated: false });
        const again = await admin.request(`/assets/licenses/${license.id}/assignments`, { method: 'POST', body: JSON.stringify({ assetId: first.id }) });
        expect(await errorCode(again)).toBe('ASSET_LICENSE_ASSIGNMENT_EXISTS');
        license = await admin.requestJson<License>(`/assets/licenses/${license.id}/assignments`, { method: 'POST', body: JSON.stringify({ assetId: second.id }) });
        expect(license).toMatchObject({ used: 2, available: -1, overAllocated: true });
        expect(await historyActions(admin, second.id)).toContain('license_assigned');
        const assignment = license.assignments.find((entry) => entry.asset?.id === second.id)!;
        license = await admin.requestJson<License>(`/assets/licenses/${license.id}/assignments/${assignment.id}`, { method: 'DELETE' });
        expect(license).toMatchObject({ used: 1, overAllocated: false });

        // Warranty contract covering the first asset.
        const badDates = await admin.request('/assets/contracts', {
          method: 'POST',
          body: JSON.stringify({ kind: 'WARRANTY', supplier: 'E2E', startsAt: inDays(10), endsAt: inDays(1), organizationalUnitId: unit.id }),
        });
        expect(await errorCode(badDates)).toBe('ASSET_INVALID');
        const contract = await admin.requestJson<Contract>('/assets/contracts', {
          method: 'POST',
          body: JSON.stringify({ kind: 'WARRANTY', supplier: `E2E Servis ${stamp}`, reference: `UG-${stamp}`, startsAt: inDays(-30), endsAt: inDays(365), organizationalUnitId: unit.id }),
        });
        contracts.push(contract.id);
        const withItem = await admin.requestJson<Contract>(`/assets/contracts/${contract.id}/items`, { method: 'POST', body: JSON.stringify({ assetId: first.id }) });
        expect(withItem.items.map((item) => item.id)).toEqual([first.id]);
        const duplicate = await admin.request(`/assets/contracts/${contract.id}/items`, { method: 'POST', body: JSON.stringify({ assetId: first.id }) });
        expect(await errorCode(duplicate)).toBe('ASSET_CONTRACT_ITEM_EXISTS');

        // The asset card shows both.
        const detail = await admin.requestJson<AssetDetail>(`/assets/${first.id}`);
        expect(detail.contracts.map((entry) => entry.id)).toContain(contract.id);
        expect(JSON.stringify(detail.licenses)).toContain(license.id);
        expect(await historyActions(admin, first.id)).toContain('contract_linked');

        // A plain user cannot read licences or contracts.
        const plain = new ApiClient();
        await plain.login(env.userEmail, env.userPassword);
        expect([403, 404]).toContain((await plain.request(`/assets/licenses/${license.id}`)).status);
        expect([403, 404]).toContain((await plain.request(`/assets/contracts/${contract.id}`)).status);
      } finally {
        for (const id of licenses) await admin.request(`/assets/licenses/${id}`, { method: 'DELETE' }).catch(() => undefined);
        for (const id of contracts) await admin.request(`/assets/contracts/${id}`, { method: 'DELETE' }).catch(() => undefined);
        await retireAssets(admin, created, 'E2E 28 cleanup');
      }
    });
  });

  test('UI: catalog, licences, contracts tabs and the asset card tabs are accessible', async ({ page }, testInfo) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    await withSettings(admin, settings, 'E2E 28 UI', async () => {
      try {
        const type = await pickAssetType(admin);
        const unit = await firstUnit(admin);
        const stamp = uniqueStamp();
        const main = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E card ${stamp}`, assetTag: `E2E-U1-${stamp}` });
        const other = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E card dep ${stamp}`, assetTag: `E2E-U2-${stamp}` });
        created.push(main.id, other.id);
        await admin.requestJson(`/assets/${main.id}/relations`, { method: 'POST', body: JSON.stringify({ toAssetId: other.id, kind: 'DEPENDS_ON' }) });

        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        for (const [tab, label] of [
          ['catalog', /Tipovi i lokacije|Types and locations/],
          ['licenses', /Licence|Licences/],
          ['contracts', /Ugovori|Contracts/],
        ] as const) {
          await page.goto(`/assets?tab=${tab}`);
          await expect(page.getByRole('tab', { name: label, selected: true })).toBeVisible({ timeout: 15_000 });
          await page.waitForLoadState('networkidle');
          await expectNoSeriousA11yViolations(page, `assets-${tab}-tab`, testInfo);
        }

        await page.goto(`/assets/${main.id}`);
        await page.getByRole('tab', { name: /^(Veze|Relations)$/ }).click();
        await expect(page.getByText(other.assetTag).first()).toBeVisible({ timeout: 15_000 });
        await expectNoSeriousA11yViolations(page, 'asset-relations-tab', testInfo);
        for (const name of [/Licence i ugovori|Licences and contracts/, /^(Historija|History)$/]) {
          await page.getByRole('tab', { name }).click();
          await page.waitForLoadState('networkidle');
          await expectNoSeriousA11yViolations(page, `asset-tab-${String(name).slice(1, 12)}`, testInfo);
        }
      } finally {
        await retireAssets(admin, created, 'E2E 28 cleanup');
      }
    });
  });
});
