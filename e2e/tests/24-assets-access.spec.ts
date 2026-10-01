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
  type AssetOptions,
} from '../helpers/assets';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

/**
 * Paket 3.2 (§2, §14, §15): who sees what. The module switch behaves as if the
 * module did not exist, a plain user only sees their own equipment, an agent
 * only sees equipment in their unit scope, and only SUPER_ADMIN deletes.
 */
test.describe('24 assets access', () => {
  test('module off: API 404 ASSETS_DISABLED and the pages say so', async ({ page }) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    await withSettings(admin, { [assetSettingKeys.cmdb]: false }, 'E2E 24 module off', async () => {
      const list = await admin.request('/assets');
      expect(list.status).toBe(404);
      expect(await errorCode(list)).toBe('ASSETS_DISABLED');
      const capabilities = await admin.requestJson<{ enabled: boolean; canRead: boolean }>('/assets/capabilities');
      expect(capabilities.enabled).toBe(false);
      expect(capabilities.canRead).toBe(false);

      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      await page.goto('/assets');
      await expect(page.getByText(/Modul imovine je isključen|The assets module is off/)).toBeVisible({ timeout: 15_000 });

      const user = new ApiClient();
      await user.login(env.userEmail, env.userPassword);
      const mine = await user.request('/assets/mine');
      expect(mine.status).toBe(404);
    });
  });

  test('plain user: own equipment only, no register, no direct link', async ({ page }, testInfo) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    await withSettings(admin, { [assetSettingKeys.cmdb]: true }, 'E2E 24 user access', async () => {
      try {
        const type = await pickAssetType(admin);
        const unit = await firstUnit(admin);
        const stamp = uniqueStamp();
        const own = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E own ${stamp}`, assetTag: `E2E-O-${stamp}` });
        created.push(own.id);
        const other = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E other ${stamp}`, assetTag: `E2E-X-${stamp}` });
        created.push(other.id);
        const receiver = await findAssignableUser(admin, env.userEmail);
        await move(admin, { scenario: 'WAREHOUSE_TO_USER', assetIds: [own.id], toUserId: receiver.id, issueDocument: false });

        const user = new ApiClient();
        await user.login(env.userEmail, env.userPassword);
        const list = await user.request('/assets');
        expect(list.status).toBe(403);
        expect(await errorCode(list)).toBe('ASSET_FORBIDDEN');
        // Even their own item is not readable through the register API.
        expect((await user.request(`/assets/${own.id}`)).status).toBe(403);
        const mine = await user.requestJson<{ items: Array<{ id: string }> }>('/assets/mine');
        const mineIds = mine.items.map((item) => item.id);
        expect(mineIds).toContain(own.id);
        expect(mineIds).not.toContain(other.id);

        await signIn(page, env.userEmail, env.userPassword);
        await page.goto('/my-assets');
        await expect(page.getByRole('heading', { name: `E2E own ${stamp}` })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(`E2E other ${stamp}`)).toHaveCount(0);
        await page.goto('/assets');
        await expect(page.getByText(/Nemate pristup registru imovine|No access to the asset register/)).toBeVisible({ timeout: 15_000 });
        await expectNoSeriousA11yViolations(page, 'assets-forbidden', testInfo);
        await page.goto(`/assets/${other.id}`);
        await expect(page.getByText(`E2E other ${stamp}`)).toHaveCount(0);
      } finally {
        await retireAssets(admin, created, 'E2E 24 cleanup');
      }
    });
  });

  test('agent: unit scope and no delete; SUPER_ADMIN deletes', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    await withSettings(admin, { [assetSettingKeys.cmdb]: true }, 'E2E 24 agent scope', async () => {
      try {
        const agent = new ApiClient();
        await agent.login(env.agentEmail, env.agentPassword);
        const type = await pickAssetType(admin);
        const stamp = uniqueStamp();
        const agentUnits = await agent.requestJson<AssetOptions>('/assets/options');
        const inside = agentUnits.units[0];
        expect(inside, 'the e2e agent has a unit in its asset scope').toBeTruthy();

        const own = await createAsset(admin, { typeId: type.id, organizationalUnitId: inside.id, name: `E2E agent-in ${stamp}`, assetTag: `E2E-AI-${stamp}` });
        created.push(own.id);
        expect((await agent.request(`/assets/${own.id}`)).status).toBe(200);

        // Agents manage but never delete (§14: delete is SUPER_ADMIN only).
        const agentDelete = await agent.request(`/assets/${own.id}`, { method: 'DELETE' });
        expect(agentDelete.status).toBe(403);
        expect(await errorCode(agentDelete)).toBe('ASSET_FORBIDDEN');

        const allUnits = await admin.requestJson<AssetOptions>('/assets/options');
        const insideIds = new Set(agentUnits.units.map((unit) => unit.id));
        const outside = allUnits.units.find((unit) => !insideIds.has(unit.id));
        if (outside === undefined) {
          test.info().annotations.push({
            type: 'skipped-part',
            description: 'Scope check skipped: the e2e agent sees every unit (global asset.read or home unit at the root). Give the agent a leaf unit to cover it.',
          });
        } else {
          const foreign = await createAsset(admin, { typeId: type.id, organizationalUnitId: outside.id, name: `E2E agent-out ${stamp}`, assetTag: `E2E-AO-${stamp}` });
          created.push(foreign.id);
          // Out of scope reads as "not found", never as "forbidden" (no existence leak).
          const read = await agent.request(`/assets/${foreign.id}`);
          expect(read.status).toBe(404);
          const search = await agent.requestJson<{ items: Array<{ id: string }> }>(`/assets?search=${encodeURIComponent(`E2E-AO-${stamp}`)}`);
          expect(search.items.map((item) => item.id)).not.toContain(foreign.id);
          const write = await agent.request(`/assets/${foreign.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'IN_REPAIR', reason: 'E2E 24' }) });
          expect(write.status).toBe(404);
        }

        // A fresh item without history: SUPER_ADMIN can delete it for good.
        const disposable = await createAsset(admin, { typeId: type.id, organizationalUnitId: inside.id, name: `E2E delete ${stamp}`, assetTag: `E2E-D-${stamp}` });
        const removed = await admin.request(`/assets/${disposable.id}`, { method: 'DELETE' });
        expect(removed.status).toBe(204);
        expect((await admin.request(`/assets/${disposable.id}`)).status).toBe(404);
      } finally {
        await retireAssets(admin, created, 'E2E 24 cleanup');
      }
    });
  });
});
