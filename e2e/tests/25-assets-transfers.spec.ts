import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from '../helpers/a11y';
import { ApiClient } from '../helpers/api-client';
import {
  assetSettingKeys,
  createAsset,
  errorCode,
  findAssignableUser,
  firstUnit,
  move,
  pickAssetType,
  retireAssets,
  uniqueStamp,
  withSettings,
} from '../helpers/assets';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type Transfer = {
  readonly id: string;
  readonly number: string;
  readonly scenario: string;
  readonly status: 'ISSUED' | 'SIGNED' | 'CANCELLED';
  readonly cancelReason: string | null;
  readonly signedFileName: string | null;
  readonly snapshot: { readonly from: { readonly name: string }; readonly to: { readonly name: string } };
};
type SignatoryUnit = {
  readonly id: string;
  readonly parentId: string | null;
  readonly own: { readonly userId: string; readonly title: string | null } | null;
  readonly effective: { readonly source: string; readonly userId: string | null; readonly inheritedFromUnitId: string | null };
};

const transferNumber = /^(\d{2})-(\d{4})-(\d{4})$/;
const settings = { [assetSettingKeys.cmdb]: true, [assetSettingKeys.transferEnabled]: true, [assetSettingKeys.transferRequired]: false };

/** Smallest well-formed PDF: the server checks the file signature, not the extension. */
function tinyPdf(): Blob {
  const body = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
  return new Blob([body], { type: 'application/pdf' });
}

/**
 * Paket 3.2 C9 (§7a): transfer records ("prenosnice") for every movement of
 * equipment — the UI flow with preview and DOCX, all three scenarios,
 * numbering, cancelling, the signed copy, the "required" switch and the
 * signatory inherited down the unit tree.
 */
test.describe('25 assets transfer records', () => {
  test('UI: assign from the card with free-text "handed over by", preview and DOCX', async ({ page }, testInfo) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    await withSettings(admin, settings, 'E2E 25 UI assign', async () => {
      try {
        const type = await pickAssetType(admin);
        const unit = await firstUnit(admin);
        const stamp = uniqueStamp();
        const asset = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E handover ${stamp}`, assetTag: `E2E-H-${stamp}` });
        created.push(asset.id);

        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        await page.goto(`/assets/${asset.id}`);
        await page.getByRole('button', { name: /^(Zaduži|Assign)$/ }).click();
        const sheet = page.getByRole('dialog');
        await expect(sheet).toBeVisible();
        await sheet.getByLabel(/^(Korisnik|User)/).fill(env.userEmail.split('@')[0]);
        await sheet.getByRole('radio', { name: new RegExp(env.userEmail.replace(/[.]/g, '\\.')) }).check();
        const giver = `E2E Nabavka ${stamp}`;
        await sheet.getByLabel(/^(Ko predaje|Handed over by)/).fill(giver);
        // The preview prints what the record will say before anything is written.
        await expect(sheet.getByRole('region').getByText(giver, { exact: true })).toBeVisible({ timeout: 15_000 });
        await expectNoSeriousA11yViolations(page, 'asset-assign-sheet', testInfo);
        await sheet.getByRole('button', { name: /^(Zaduži|Assign)$/ }).click();

        const issued = sheet.getByRole('status').filter({ hasText: /\d{2}-\d{4}-\d{4}/ });
        await expect(issued).toBeVisible({ timeout: 15_000 });
        const number = (await issued.textContent())?.match(/\d{2}-\d{4}-\d{4}/)?.[0];
        expect(number).toMatch(transferNumber);
        const downloadPromise = page.waitForEvent('download');
        await sheet.getByRole('button', { name: /Preuzmi DOCX|Download DOCX/ }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.docx$/);
        await issued.getByRole('button', { name: /^(Zatvori|Close)$/ }).click();

        // The record is on the card's "Transfer records" tab and carries the free text.
        await page.getByRole('tab', { name: /Prenosnice|Transfer records/ }).click();
        await expect(page.getByText(number!).first()).toBeVisible({ timeout: 15_000 });
        const list = await admin.requestJson<Transfer[] | { items: Transfer[] }>(`/assets/${asset.id}/transfers`);
        const items = Array.isArray(list) ? list : list.items;
        const record = items.find((entry) => entry.number === number);
        expect(record, 'record listed on the asset').toBeTruthy();
        const detail = await admin.requestJson<Transfer>(`/assets/transfers/${record!.id}`);
        expect(detail.scenario).toBe('WAREHOUSE_TO_USER');
        expect(detail.snapshot.from.name).toBe(giver);
      } finally {
        await retireAssets(admin, created, 'E2E 25 cleanup');
      }
    });
  });

  test('API: three scenarios, numbering, cancel, signed copy and what the user sees', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    await withSettings(admin, settings, 'E2E 25 scenarios', async () => {
      try {
        const type = await pickAssetType(admin);
        const unit = await firstUnit(admin);
        const stamp = uniqueStamp();
        const asset = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E scenarios ${stamp}`, assetTag: `E2E-S-${stamp}` });
        created.push(asset.id);
        const user = await findAssignableUser(admin, env.userEmail);
        const agent = await findAssignableUser(admin, env.agentEmail);

        // Warehouse → user: empty "handed over by" prints the warehouse label.
        const first = await move(admin, { scenario: 'WAREHOUSE_TO_USER', assetIds: [asset.id], toUserId: user.id, issueDocument: true });
        expect(first.number).toMatch(transferNumber);
        const firstRecord = await admin.requestJson<Transfer>(`/assets/transfers/${first.transferId}`);
        expect(firstRecord.snapshot.from.name.length).toBeGreaterThan(0);

        // User → user, then user → warehouse; numbers grow within the month.
        const second = await move(admin, { scenario: 'USER_TO_USER', assetIds: [asset.id], toUserId: agent.id, issueDocument: true });
        const third = await move(admin, { scenario: 'USER_TO_WAREHOUSE', assetIds: [asset.id], returnStatus: 'IN_STOCK', issueDocument: true });
        const parsed = [first, second, third].map((entry) => transferNumber.exec(entry.number ?? '')!);
        for (const match of parsed) expect(match).toBeTruthy();
        expect(new Set(parsed.map((match) => `${match[1]}-${match[3]}`)).size).toBe(1);
        expect(Number(parsed[1][2])).toBeGreaterThan(Number(parsed[0][2]));
        expect(Number(parsed[2][2])).toBeGreaterThan(Number(parsed[1][2]));
        expect((await admin.requestJson<Transfer>(`/assets/transfers/${second.transferId}`)).scenario).toBe('USER_TO_USER');
        expect((await admin.requestJson<Transfer>(`/assets/transfers/${third.transferId}`)).scenario).toBe('USER_TO_WAREHOUSE');

        // The receiving user sees their records, downloads the DOCX, but cannot cancel.
        const plain = new ApiClient();
        await plain.login(env.userEmail, env.userPassword);
        const mine = await plain.requestJson<Transfer[] | { items: Transfer[] }>('/assets/transfers/mine');
        const mineIds = (Array.isArray(mine) ? mine : mine.items).map((entry) => entry.id);
        expect(mineIds).toEqual(expect.arrayContaining([first.transferId, second.transferId]));
        expect((await plain.request(`/assets/transfers/${first.transferId}/document`)).status).toBe(200);
        const userCancel = await plain.request(`/assets/transfers/${first.transferId}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'E2E nije dozvoljeno' }) });
        expect([403, 404]).toContain(userCancel.status);

        // Cancel: a reason is required; cancelling does not move the equipment back.
        const short = await admin.request(`/assets/transfers/${third.transferId}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'x' }) });
        expect(short.status).toBe(400);
        const cancelled = await admin.requestJson<{ status: string }>(`/assets/transfers/${third.transferId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'E2E storno prenosnice' }),
        });
        expect(cancelled.status).toBe('CANCELLED');
        const cancelledRecord = await admin.requestJson<Transfer>(`/assets/transfers/${third.transferId}`);
        expect(cancelledRecord.cancelReason).toBe('E2E storno prenosnice');
        const signedOnCancelled = new FormData();
        signedOnCancelled.append('file', tinyPdf(), 'potpisana.pdf');
        const refused = await admin.request(`/assets/transfers/${third.transferId}/signed`, { method: 'POST', body: signedOnCancelled });
        expect(refused.status).toBe(409);

        // Signed copy (PDF, scanned by ClamAV) turns the record into SIGNED.
        const form = new FormData();
        form.append('file', tinyPdf(), `potpisana-${stamp}.pdf`);
        const upload = await admin.request(`/assets/transfers/${first.transferId}/signed`, { method: 'POST', body: form });
        if (upload.status === 503) {
          test.info().annotations.push({ type: 'skipped-part', description: `Signed copy skipped: ${await errorCode(upload)} (ClamAV not reachable).` });
        } else {
          expect(upload.status).toBe(200);
          const signed = await admin.requestJson<Transfer>(`/assets/transfers/${first.transferId}`);
          expect(signed.status).toBe('SIGNED');
          const copy = await admin.request(`/assets/transfers/${first.transferId}/signed`);
          expect(copy.status).toBe(200);
          expect(copy.headers.get('content-type') ?? '').toContain('pdf');
        }
        const notAPdf = new FormData();
        notAPdf.append('file', new Blob(['just text'], { type: 'application/pdf' }), 'fake.pdf');
        const fake = await admin.request(`/assets/transfers/${second.transferId}/signed`, { method: 'POST', body: notAPdf });
        expect(fake.status).toBe(400);
        expect(await errorCode(fake)).toBe('ASSET_TRANSFER_FILE_INVALID');
      } finally {
        await retireAssets(admin, created, 'E2E 25 cleanup');
      }
    });
  });

  test('"required" switch: no direct assign, every movement issues a record', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    await withSettings(admin, { ...settings, [assetSettingKeys.transferRequired]: true }, 'E2E 25 required', async () => {
      try {
        const type = await pickAssetType(admin);
        const unit = await firstUnit(admin);
        const stamp = uniqueStamp();
        const asset = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E required ${stamp}`, assetTag: `E2E-R-${stamp}` });
        created.push(asset.id);
        const user = await findAssignableUser(admin, env.userEmail);
        const configuration = await admin.requestJson<{ enabled: boolean; required: boolean }>('/assets/transfers/configuration');
        expect(configuration).toEqual({ enabled: true, required: true });

        const direct = await admin.request(`/assets/${asset.id}/assign`, { method: 'POST', body: JSON.stringify({ userId: user.id }) });
        expect(direct.status).toBe(409);
        expect(await errorCode(direct)).toBe('ASSET_TRANSFER_REQUIRED');
        // Asking for no document is ignored while records are required.
        const moved = await move(admin, { scenario: 'WAREHOUSE_TO_USER', assetIds: [asset.id], toUserId: user.id, issueDocument: false });
        expect(moved.transferId).not.toBeNull();
        expect(moved.number).toMatch(transferNumber);
      } finally {
        await retireAssets(admin, created, 'E2E 25 cleanup');
      }
    });
  });

  test('signatory set on a parent unit is inherited by its children', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    await withSettings(admin, settings, 'E2E 25 signatory', async () => {
      const catalog = await admin.requestJson<{ units: SignatoryUnit[] }>('/assets/transfers/signatories');
      const child = catalog.units.find((unit) => unit.parentId !== null && unit.own === null);
      if (child === undefined) {
        test.skip(true, 'No child unit without its own signatory on this environment.');
        return;
      }
      const parent = catalog.units.find((unit) => unit.id === child.parentId)!;
      const previous = parent.own;
      const signatory = await findAssignableUser(admin, env.agentEmail);
      try {
        await admin.requestJson(`/assets/transfers/signatories/${parent.id}`, {
          method: 'PUT',
          body: JSON.stringify({ userId: signatory.id, title: 'E2E potpisnik' }),
        });
        const after = await admin.requestJson<{ units: SignatoryUnit[] }>('/assets/transfers/signatories');
        const inherited = after.units.find((unit) => unit.id === child.id)!;
        expect(inherited.own).toBeNull();
        expect(inherited.effective.source).toBe('unit');
        expect(inherited.effective.userId).toBe(signatory.id);
        expect(inherited.effective.inheritedFromUnitId).toBe(parent.id);

        // Only catalog admins edit signatories.
        const agentClient = new ApiClient();
        await agentClient.login(env.agentEmail, env.agentPassword);
        const denied = await agentClient.request(`/assets/transfers/signatories/${parent.id}`, { method: 'DELETE' });
        expect([403, 404]).toContain(denied.status);
      } finally {
        if (previous === null) {
          await admin.request(`/assets/transfers/signatories/${parent.id}`, { method: 'DELETE' }).catch(() => undefined);
        } else {
          await admin
            .request(`/assets/transfers/signatories/${parent.id}`, { method: 'PUT', body: JSON.stringify({ userId: previous.userId, title: previous.title ?? undefined }) })
            .catch(() => undefined);
        }
      }
    });
  });
});
