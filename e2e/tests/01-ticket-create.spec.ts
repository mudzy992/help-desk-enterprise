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
    await page.getByRole('button', { name: /dalje|next|nastavi/i }).click();
    await page.getByRole('button', { name: /nastavi|continue|dalje/i }).click();
    await page.getByRole('button', { name: /kreiraj|create|pošalji|submit/i }).click();
    await expect(page).toHaveURL(/\/tickets\/[^/]+$/, { timeout: 30_000 });
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const inbox = await api.requestJson<Array<{ title: string }>>(
      '/tickets/inbox',
    );
    expect(inbox.some((ticket) => ticket.title === title)).toBe(true);
  });
});
