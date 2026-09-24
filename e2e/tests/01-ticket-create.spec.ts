import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';
import { test, expect } from '@playwright/test';

test.describe('01 ticket create', () => {
  test('creates a ticket through catalog → form → KB → review', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/tickets/new');
    await page.getByText(/opšti zahtjev|general request/i).first().click();
    await page.getByRole('button', { name: /dalje|next|nastavi/i }).click();
    await page.locator('input, textarea').first().waitFor({ state: 'visible' });
    const title = `E2E create ${Date.now()}`;
    await page.getByLabel(/naslov|title/i).fill(title);
    await page.getByLabel(/opis|description/i).fill('E2E ticket description body');
    const originUnit = page.getByLabel(/jedinica porijekla|origin organizational unit/i);
    if (await originUnit.isVisible().catch(() => false)) {
      await originUnit.selectOption({ index: 1 });
    }
    await page
      .getByRole('button', { name: /provjeri bazu znanja|check knowledge base/i })
      .click();
    await page
      .getByRole('button', { name: /nastavi sa slanjem|continue with submission/i })
      .click();
    await page.getByRole('button', { name: /pošalji tiket|send ticket/i }).click();
    const duplicate = page.getByRole('button', { name: /svejedno kreiraj|create anyway/i });
    if (await duplicate.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await duplicate.click();
    }
    await expect(page).toHaveURL(/\/tickets\/[^/?#]+$/, { timeout: 30_000 });
    const ticketId = new URL(page.url()).pathname.split('/').pop() ?? '';
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const created = await api.requestJson<{ title: string }>(`/tickets/${ticketId}`);
    expect(created.title).toBe(title);
  });
});
