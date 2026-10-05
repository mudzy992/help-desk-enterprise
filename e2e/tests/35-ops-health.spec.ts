import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type OpsOverview = {
  readonly components: {
    readonly api: string;
    readonly database: string;
    readonly redis: string;
  };
};

/**
 * Paket 2.7 (§6): "System health" (Admin → Operations) beyond the visibility
 * check in spec 21 - the live component probes the card renders, the manual
 * refresh, and the fact that a plain user keeps getting 403 from `/ops/*`.
 */
test.describe('35 ops health card', () => {
  test('the admin sees live component health and can refresh it', async ({ page }) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const overview = await admin.requestJson<OpsOverview>('/ops/health');
    expect(overview.components.api).toBe('ok');
    expect(overview.components.database).toBe('ok');
    expect(overview.components.redis).toBe('ok');

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/admin?tab=ops');
    const card = page.getByTestId('ops-health-card');
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Live probes of the API, the database and Redis come back as healthy.
    await expect(card.getByRole('heading', { name: /Komponente|Components/ })).toBeVisible();
    await expect(card.getByText('API', { exact: true })).toBeVisible();
    await expect(card.getByText(/Baza podataka|Database/)).toBeVisible();
    await expect(card.getByText('Redis', { exact: true })).toBeVisible();

    await card.getByRole('button', { name: /Osvježi|Refresh/ }).click();
    await expect(card).toBeVisible();
    await expect(card.getByText(/Nema pristupa|No access/)).toHaveCount(0);
  });

  test('a plain user has no access to operations health', async ({ page }) => {
    const env = readE2EEnvironment();
    const user = new ApiClient();
    await user.login(env.userEmail, env.userPassword);
    expect((await user.request('/ops/health')).status).toBe(403);
    expect((await user.request('/ops/alerts')).status).toBe(403);

    await signIn(page, env.userEmail, env.userPassword);
    await page.goto('/admin?tab=ops');
    await expect(page.getByText(/Nema pristupa administraciji|No access to administration/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('ops-health-card')).toHaveCount(0);
  });
});
