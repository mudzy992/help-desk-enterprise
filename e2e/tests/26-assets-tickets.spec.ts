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
import { loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type TicketAssets = {
  readonly enabled: boolean;
  readonly canEdit: boolean;
  readonly items: ReadonlyArray<{ readonly assetId?: string; readonly id?: string; readonly assetTag: string; readonly isPrimary: boolean }>;
};
type CreatedTicket = { readonly id: string; readonly assignedGroupId: string | null; readonly status: string };

const settings = {
  [assetSettingKeys.cmdb]: true,
  [assetSettingKeys.ticketPicker]: true,
  [assetSettingKeys.transferEnabled]: false,
  [assetSettingKeys.transferRequired]: false,
};

function linkedIds(list: TicketAssets): string[] {
  return list.items.map((item) => item.assetId ?? item.id ?? '');
}

/**
 * Paket 3.2 §8 + C9b: equipment on tickets — the requester's picker, the
 * link written at creation, routing by asset type, the agent's panel and
 * the ticket on the asset card.
 */
test.describe('26 assets on tickets', () => {
  test('user reports a problem on own equipment; the type routes the ticket; agent sees it', async ({ page, browser, baseURL }, testInfo) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    let typeId: string | null = null;
    await withSettings(admin, settings, 'E2E 26 tickets', async () => {
      try {
        const groups = await admin.requestJson<ReadonlyArray<{ id: string; isActive?: boolean }>>('/groups');
        const group = groups.find((entry) => entry.isActive !== false);
        test.skip(group === undefined, 'No active group to route to.');
        const stamp = uniqueStamp();
        const type = await admin.requestJson<{ id: string }>('/assets/catalog/types', {
          method: 'POST',
          body: JSON.stringify({
            key: `e2e-routed-${stamp}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 48),
            nameBs: `E2E rutirani tip ${stamp}`,
            nameEn: `E2E routed type ${stamp}`,
            icon: 'monitor',
            category: 'HARDWARE',
            isUserSelectable: true,
            routingGroupId: group!.id,
            sortOrder: 9000,
          }),
        });
        typeId = type.id;
        const unit = await firstUnit(admin);
        const user = await findAssignableUser(admin, env.userEmail);
        const mine = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E monitor ${stamp}`, assetTag: `E2E-T-${stamp}` });
        const foreign = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E foreign ${stamp}`, assetTag: `E2E-F-${stamp}` });
        created.push(mine.id, foreign.id);
        await move(admin, { scenario: 'WAREHOUSE_TO_USER', assetIds: [mine.id], toUserId: user.id, issueDocument: false });

        // The picker offers exactly the user's own selectable equipment.
        const requester = new ApiClient();
        await requester.login(env.userEmail, env.userPassword);
        const picker = await requester.requestJson<{ enabled: boolean; items: ReadonlyArray<{ id: string }> }>('/assets/ticket-picker');
        expect(picker.enabled).toBe(true);
        expect(picker.items.map((item) => item.id)).toContain(mine.id);
        expect(picker.items.map((item) => item.id)).not.toContain(foreign.id);

        // "Report a problem" on My equipment opens the form with the asset preselected.
        await signIn(page, env.userEmail, env.userPassword);
        await page.goto('/my-assets');
        await page.getByRole('link', { name: new RegExp(mine.name) }).click();
        await expect(page).toHaveURL(new RegExp(`/tickets/new\\?assetId=${mine.id}`));

        const catalog = await loadSeedCatalog(requester);
        const base = { description: 'E2E ticket about equipment', serviceId: catalog.serviceId, formVersionRef: catalog.formVersionRef, impact: 'MEDIUM', urgency: 'MEDIUM', formData: {} };
        // Someone else's equipment cannot be picked.
        const refused = await requester.request('/tickets', { method: 'POST', body: JSON.stringify({ ...base, title: `E2E foreign ${stamp}`, assetId: foreign.id }) });
        expect(refused.status).toBeGreaterThanOrEqual(400);
        expect(refused.status).toBeLessThan(500);
        expect(await errorCode(refused)).toBe('ASSET_NOT_SELECTABLE');

        const ticket = await requester.requestJson<CreatedTicket>('/tickets', {
          method: 'POST',
          body: JSON.stringify({ ...base, title: `E2E equipment ${stamp}`, assetId: mine.id }),
        });
        expect(ticket.assignedGroupId, 'asset type routes to its handler group').toBe(group!.id);

        const links = await admin.requestJson<TicketAssets>(`/assets/tickets/${ticket.id}`);
        expect(links.enabled).toBe(true);
        expect(linkedIds(links)).toEqual([mine.id]);
        expect(links.items[0].isPrimary).toBe(true);
        const history = await admin.requestJson<ReadonlyArray<{ action: string }> | { items: ReadonlyArray<{ action: string }> }>(`/assets/${mine.id}/history`);
        const actions = (Array.isArray(history) ? history : (history as { items: ReadonlyArray<{ action: string }> }).items).map((row) => row.action);
        expect(actions).toContain('ticket_linked');

        // Agent links a second asset, makes it primary, unlinks it again.
        await admin.requestJson(`/assets/tickets/${ticket.id}/links`, { method: 'POST', body: JSON.stringify({ assetId: foreign.id }) });
        await admin.requestJson(`/assets/tickets/${ticket.id}/links/${foreign.id}/primary`, { method: 'POST', body: '{}' });
        const switched = await admin.requestJson<TicketAssets>(`/assets/tickets/${ticket.id}`);
        expect(switched.items.find((item) => (item.assetId ?? item.id) === foreign.id)?.isPrimary).toBe(true);
        expect(switched.items.filter((item) => item.isPrimary)).toHaveLength(1);
        const unlink = await admin.request(`/assets/tickets/${ticket.id}/links/${foreign.id}`, { method: 'DELETE' });
        expect(unlink.ok).toBe(true);

        // The requester cannot edit links.
        const userLink = await requester.request(`/assets/tickets/${ticket.id}/links`, { method: 'POST', body: JSON.stringify({ assetId: foreign.id }) });
        expect([403, 404]).toContain(userLink.status);

        // Agent UI: panel on the ticket, ticket on the asset card.
        // A fresh context: the requester's session must not leak into the agent view.
        const agentContext = await browser.newContext({ baseURL });
        const agentPage = await agentContext.newPage();
        try {
          await signIn(agentPage, env.superAdminEmail, env.superAdminPassword);
          await agentPage.goto(`/tickets/${ticket.id}`);
          const panel = agentPage.getByTestId('ticket-assets-panel');
          await expect(panel).toBeVisible({ timeout: 15_000 });
          await expect(panel.getByText(mine.assetTag)).toBeVisible();
          await expectNoSeriousA11yViolations(agentPage, 'ticket-assets-panel', testInfo);
          await agentPage.goto(`/assets/${mine.id}`);
          await agentPage.getByRole('tab', { name: /Tiketi|Tickets/ }).click();
          await expect(agentPage.getByRole('link', { name: new RegExp(`E2E equipment ${stamp}`) }).or(agentPage.getByText(`E2E equipment ${stamp}`)).first()).toBeVisible({ timeout: 15_000 });
        } finally {
          await agentContext.close();
        }
      } finally {
        await retireAssets(admin, created, 'E2E 26 cleanup');
        if (typeId !== null) {
          await admin.request(`/assets/catalog/types/${typeId}/archive`, { method: 'POST', body: JSON.stringify({ archived: true }) }).catch(() => undefined);
        }
      }
    });
  });

  test('picker off: no picker, and an assetId on create is refused', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const created: string[] = [];
    await withSettings(admin, { ...settings, [assetSettingKeys.ticketPicker]: false }, 'E2E 26 picker off', async () => {
      try {
        const type = await pickAssetType(admin);
        const unit = await firstUnit(admin);
        const stamp = uniqueStamp();
        const asset = await createAsset(admin, { typeId: type.id, organizationalUnitId: unit.id, name: `E2E picker off ${stamp}`, assetTag: `E2E-P-${stamp}` });
        created.push(asset.id);
        const user = await findAssignableUser(admin, env.userEmail);
        await move(admin, { scenario: 'WAREHOUSE_TO_USER', assetIds: [asset.id], toUserId: user.id, issueDocument: false });

        const requester = new ApiClient();
        await requester.login(env.userEmail, env.userPassword);
        const picker = await requester.requestJson<{ enabled: boolean; items: readonly unknown[] }>('/assets/ticket-picker');
        expect(picker).toEqual({ enabled: false, items: [] });
        const catalog = await loadSeedCatalog(requester);
        const response = await requester.request('/tickets', {
          method: 'POST',
          body: JSON.stringify({
            title: `E2E picker off ${stamp}`,
            description: 'E2E',
            serviceId: catalog.serviceId,
            formVersionRef: catalog.formVersionRef,
            impact: 'MEDIUM',
            urgency: 'MEDIUM',
            formData: {},
            assetId: asset.id,
          }),
        });
        expect(await errorCode(response)).toBe('ASSET_NOT_SELECTABLE');
      } finally {
        await retireAssets(admin, created, 'E2E 26 cleanup');
      }
    });
  });
});
