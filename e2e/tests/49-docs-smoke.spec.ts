import { expect, test } from '@playwright/test';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

test.describe('49 docs smoke', () => {
  test('opens docs, searches with two characters and reloads navigation after locale change', async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/docs');
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 15_000 });
    const search = page.getByRole('searchbox');
    await search.fill('ad');
    await expect(page).toHaveURL(/\?q=ad/);
    await expect(page.getByTestId('docs-search-status')).toBeVisible();

    const locale = page.getByLabel(/Jezik|Language/).first();
    if (await locale.isVisible()) {
      const current = await locale.inputValue();
      await locale.selectOption(current === 'bs' ? 'en' : 'bs');
      await expect(locale).not.toHaveValue(current);
      await expect(page.getByRole('navigation').first()).toBeVisible();
    }
  });
});
