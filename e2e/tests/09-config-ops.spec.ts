import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

test.describe('09 config ops', () => {
  test('validate → shadow → activate → rollback', async ({ page }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const created = await api.requestJson<{ id: string }>('/config-versions', {
      method: 'POST',
      body: JSON.stringify({ reason: `E2E config ${Date.now()}` }),
    });
    await api.requestJson(`/config-versions/${created.id}/validate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await api.requestJson(`/config-versions/${created.id}/shadow`, {
      method: 'POST',
      body: JSON.stringify({ sampleSize: 5 }),
    });
    await api.requestJson(`/config-versions/${created.id}/activate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const rolled = await api.requestJson<{ id: string }>(
      `/config-versions/${created.id}/rollback`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'E2E rollback' }),
      },
    );
    expect(rolled.id.length).toBeGreaterThan(0);
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/admin/config-versions');
    await expect(page.getByText(/config|verzij|version/i).first()).toBeVisible();
  });
});
