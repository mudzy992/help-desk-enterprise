import { expect, test, type Page } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type ManagedDetail = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
};

function localInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(
    date.getHours(),
  ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function manageRow(page: Page, title: string) {
  return page.getByRole('row').filter({ hasText: title });
}

/**
 * 5.3.7 (§4.7 — najave): main flows — create a draft with targeting and an
 * acknowledgement requirement, publish it, and read the acknowledgement
 * report. With no audience filter the announcement goes to everyone, so the
 * publisher is in the audience and the report must read "0 of <count>".
 * Cleanup withdraws and deletes through the API, even on failure.
 */
test.describe('45 announcements lifecycle (5.3.7)', () => {
  test('draft is created, published and reports acknowledgements', async ({ page }) => {
    test.setTimeout(150_000);
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(30_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const stamp = Date.now();
    const title = `E2E Najava ${stamp}`;
    let announcementId: string | null = null;

    try {
      await test.step('sign in and open the manage tab', async () => {
        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        await page.goto('/announcements?tab=manage');
        await page.getByRole('tab', { name: /Upravljanje|Manage/ }).click();
        await page.getByRole('button', { name: /Nova najava|New announcement/ }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      });

      await test.step('fill the draft with an immediate window and acknowledgement', async () => {
        const dialog = page.getByRole('dialog');
        // Required labels render a visually-marked asterisk, so the accessible
        // name may carry a suffix — match by prefix, not by exact equality.
        await dialog.getByRole('textbox', { name: /Naslov|Title/ }).first().fill(title);
        await dialog.getByRole('textbox', { name: /^(?:Tekst|Body)$/ }).fill(`Sadržaj E2E najave ${stamp}.`);
        const startsAt = new Date(Date.now() - 60_000);
        const endsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
        await dialog.getByLabel(/Početak prikaza|Starts at/).fill(localInputValue(startsAt));
        await dialog.getByLabel(/Kraj prikaza|Ends at/).fill(localInputValue(endsAt));
        await dialog
          .getByRole('checkbox', { name: /Traži potvrdu čitanja|Require read acknowledgement/ })
          .check();
        // No audience filter: the hint says the announcement goes to everyone.
        await dialog.getByRole('button', { name: /Spremi nacrt|Save draft/ }).click();
        await expect(dialog).toBeHidden();
      });

      await test.step('the draft row appears with publish and delete actions', async () => {
        const row = manageRow(page, title);
        await expect(row).toBeVisible();
        await expect(row).toContainText(/Nacrt|Draft/);
        await expect(row.getByRole('button', { name: /Objavi|Publish/ })).toBeVisible();
      });

      await test.step('publish and see the row turn active', async () => {
        await manageRow(page, title).getByRole('button', { name: /Objavi|Publish/ }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: /^(?:Objavi|Publish)$/ }).click();
        const row = manageRow(page, title);
        await expect(row).toContainText(/Aktivna|Published/i);
      });

      await test.step('the read report shows zero of the audience', async () => {
        await manageRow(page, title).getByRole('button', { name: /Izvještaj|Report/ }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(/Izvještaj o potvrdama|Acknowledgement report/i);
        await expect(dialog).toContainText(/Potvrdilo 0 od \d+|\b0 of \d+/);
      });

      await test.step('the publisher sees the announcement in their own tab', async () => {
        await page.getByRole('tab', { name: /Moje najave|My announcements/ }).click();
        await expect(page.getByText(title).first()).toBeVisible();
      });
    } finally {
      const cleanedUp = await test.step('restore: withdraw and delete through the API', async () => {
        const list = await api.requestJson<{ readonly announcements: readonly ManagedDetail[] }>(
          '/announcements/manage',
        );
        const created = list.announcements.find((item) => item.title === title) ?? null;
        if (created === null) return false;
        announcementId = created.id;
        if (created.status !== 'DRAFT') {
          const withdrawn = await api.request(`/announcements/manage/${encodeURIComponent(created.id)}/withdraw`, {
            method: 'POST',
            body: JSON.stringify({ reason: 'E2E 5.3.7 cleanup' }),
          });
          if (!withdrawn.ok) {
            console.warn(`[e2e] withdraw returned HTTP ${withdrawn.status}`);
          }
        }
        const deleted = await api.request(`/announcements/manage/${encodeURIComponent(created.id)}`, { method: 'DELETE' });
        if (!deleted.ok) {
          console.warn(`[e2e] delete returned HTTP ${deleted.status}; the withdrawn announcement may remain in the archive.`);
        }
        return deleted.ok;
      });
      void announcementId;
      void cleanedUp;
    }
  });
});
