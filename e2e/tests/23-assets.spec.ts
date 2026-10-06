import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from '../helpers/a11y';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type RegistryEntry = { readonly key: string; readonly value: unknown };
type Catalog = { readonly types: ReadonlyArray<{ readonly id: string; readonly key: string; readonly archivedAt: string | null }> };
type Options = { readonly units: ReadonlyArray<{ readonly id: string; readonly path: string }> };
type UserHit = { readonly id: string; readonly email: string };
type Movement = { readonly transferId: string | null; readonly number: string | null; readonly movedAssetIds: readonly string[] };
type Packs = { readonly packs: ReadonlyArray<{ readonly key: string }> };

const cmdbKey = 'private.addons.cmdb';

async function readSetting(api: ApiClient, key: string): Promise<unknown> {
  const entries = await api.requestJson<RegistryEntry[]>('/settings');
  return entries.find((entry) => entry.key === key)?.value ?? null;
}

async function setSetting(api: ApiClient, key: string, value: unknown): Promise<void> {
  await api.requestJson('/settings', { method: 'PUT', body: JSON.stringify({ key, value, reason: 'E2E 23 assets' }) });
}

/**
 * Paket 3.2 (C10, §23): the CMDB module end to end. The module is off by
 * default, so the test switches it on and restores the previous value. An
 * admin registers equipment, hands it to the user with a transfer record
 * (numbered, DOCX), the user sees it on "My equipment", the manager overview
 * and the CMDB report packs appear, and the pages pass axe (serious/critical).
 */
test.describe('23 assets (CMDB)', () => {
  test('register → transfer record → My equipment → overview and report packs', async ({ page, browser }, testInfo) => {
    // Run 2026-10-05 (`specs=11,14,22,23,24`): the spec reached the end of its work
    // for the first time and hit the global 90 s timeout. It does four axe scans
    // on heavy pages, a second browser context and three sign-ins — the same
    // reason specs 20 sets its own budget. `test.slow()` triples the timeout to
    // 270 s; the phase log below says where the time goes if it ever times out
    // again (worker stdout lands in the job log).
    test.slow();
    const startedAt = Date.now();
    const phase = (name: string) =>
      console.log(`[23 assets] +${((Date.now() - startedAt) / 1000).toFixed(1)}s ${name}`);
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    phase('prijava admina');
    const previous = await readSetting(admin, cmdbKey);
    await setSetting(admin, cmdbKey, true);
    let assetId: string | null = null;
    try {
      phase('addon uključen');
      const catalog = await admin.requestJson<Catalog>('/assets/catalog');
      const type = catalog.types.find((entry) => entry.archivedAt === null && entry.key === 'laptop') ?? catalog.types.find((entry) => entry.archivedAt === null);
      expect(type, 'seeded asset types').toBeTruthy();
      const options = await admin.requestJson<Options>('/assets/options');
      const unit = options.units[0];
      expect(unit, 'an organizational unit in scope').toBeTruthy();
      const stamp = Date.now();
      const created = await admin.requestJson<{ id: string; assetTag: string }>('/assets', {
        method: 'POST',
        body: JSON.stringify({ typeId: type!.id, name: `E2E laptop ${stamp}`, assetTag: `E2E-${stamp}`, organizationalUnitId: unit.id, status: 'IN_STOCK' }),
      });
      assetId = created.id;

      const users = await admin.requestJson<{ items: UserHit[] }>(`/assets/users?search=${encodeURIComponent(env.userEmail.split('@')[0])}`);
      const receiver = users.items.find((user) => user.email === env.userEmail);
      expect(receiver, 'the e2e user is assignable').toBeTruthy();

      const moved = await admin.requestJson<Movement>('/assets/movements', {
        method: 'POST',
        body: JSON.stringify({ scenario: 'WAREHOUSE_TO_USER', assetIds: [created.id], toUserId: receiver!.id, issueDocument: true }),
      });
      expect(moved.movedAssetIds).toEqual([created.id]);
      if (moved.transferId !== null) {
        expect(moved.number).toMatch(/^\d{2}-\d{4}-\d{4}$/);
        const document = await admin.request(`/assets/transfers/${moved.transferId}/document`);
        expect(document.status).toBe(200);
        expect(document.headers.get('content-type') ?? '').toContain('officedocument.wordprocessingml');
      }

      phase('imovina kreirana i prenesena');
      // Same OU-scope requirement as in spec 14: the list is guarded too. The
      // earlier `.catch(() => null)` turned a 403 into a silent skip of this
      // assertion, which is why the missing scope parameter stayed invisible.
      const packs = await admin.requestJson<Packs>(
        `/reports/packs?organizationalUnitId=${unit.id}`,
      );
      expect(packs.packs.map((pack) => pack.key)).toEqual(
        expect.arrayContaining(['asset_inventory', 'asset_expiring']),
      );
      const overview = await admin.request('/assets/overview');
      expect(overview.status).toBe(200);

      // The user sees the equipment on "My equipment".
      const userContext = await browser.newContext();
      const userPage = await userContext.newPage();
      await signIn(userPage, env.userEmail, env.userPassword);
      await userPage.goto('/my-assets');
      await expect(userPage.getByRole("heading", { name: `E2E laptop ${stamp}` })).toBeVisible({ timeout: 15_000 });
      phase('korisnik vidi "Moja imovina"');
      await expectNoSeriousA11yViolations(userPage, 'my-assets', testInfo);
      await userContext.close();

      // The admin sees the register, the overview tab and the transfer register.
      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      await page.goto(`/assets?tab=overview`);
      await expect(page.getByRole('tab', { name: /Pregled|Overview/ })).toBeVisible({ timeout: 15_000 });
      // Heading, not text: the table repeats the title as its (sr-only) caption.
      await expect(page.getByRole("heading", { name: /Oprema po statusu|Equipment by status/ })).toBeVisible();
      phase('axe: pregled imovine');
      await expectNoSeriousA11yViolations(page, 'assets-overview', testInfo);
      await page.goto('/assets');
      await expect(page.getByRole('link', { name: `E2E-${stamp}` })).toBeVisible({ timeout: 15_000 });
      // "New asset" stays disabled until the catalog and options load; wait for it before axe.
      await expect(page.getByRole("button", { name: /Nova stavka|New asset/ })).toBeEnabled({ timeout: 15_000 });
      phase('axe: registar imovine');
      await expectNoSeriousA11yViolations(page, 'assets-register', testInfo);
      await page.goto(`/assets/${created.id}`);
      await expect(page.getByText(`E2E laptop ${stamp}`).first()).toBeVisible();
      phase('axe: detalj imovine');
      await expectNoSeriousA11yViolations(page, 'asset-detail', testInfo);

      // A plain user cannot read the register.
      phase('korisnik odbijen (403)');
      const plain = new ApiClient();
      await plain.login(env.userEmail, env.userPassword);
      expect((await plain.request('/assets')).status).toBe(403);
    } finally {
      if (assetId !== null) {
        // Back to stock without a record, then retire; transfer history stays.
        await admin
          .request('/assets/movements', {
            method: 'POST',
            body: JSON.stringify({ scenario: 'USER_TO_WAREHOUSE', assetIds: [assetId], returnStatus: 'IN_STOCK', issueDocument: false }),
          })
          .catch(() => undefined);
        await admin
          .request(`/assets/${assetId}/status`, { method: 'POST', body: JSON.stringify({ status: 'RETIRED', reason: 'E2E 23 cleanup' }) })
          .catch(() => undefined);
      }
      await setSetting(admin, cmdbKey, previous === true);
    }
  });
});
