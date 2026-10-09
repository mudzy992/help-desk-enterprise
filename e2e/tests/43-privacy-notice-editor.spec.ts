import { expect, test, type Page } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type NoticeStatus = {
  readonly enabled: boolean;
  readonly maxLength: number;
  readonly notice: { readonly bs: string; readonly en: string };
};

/**
 * The editor keeps one textarea whose test id follows the active language
 * (`privacy-notice-textarea-bs|en`); the language is switched on the Segmented
 * radio group, so a value check for a locale must click its radio first.
 */
function localeRadio(page: Page, locale: 'bs' | 'en') {
  return page.getByRole('radio', { name: new RegExp(`^${locale}$`, 'i') });
}

/**
 * 5.3.7 (§4.7 — privatnost): the dedicated privacy-notice editor. The test
 * mutates the two notice settings, so it snapshots the original values up
 * front and restores them in `finally` — even on failure — to leave the
 * installation's public notice untouched.
 */
test.describe('43 privacy notice editor (5.3.7)', () => {
  test('notice editor generates, saves, publishes, flags the draft and restores', async ({ page }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(30_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const original = await api.requestJson<NoticeStatus>('/privacy/notice/status');

    try {
      await test.step('sign in and open the notice editor', async () => {
        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        await page.goto('/privacy?tab=notice');
        await expect(page.getByTestId('privacy-notice-editor')).toBeVisible();
        // The settings row and the editor read the same two keys. BS is the
        // active language on open; EN must be checked after switching to it.
        await expect(page.getByTestId('privacy-notice-textarea-bs')).toHaveValue(original.notice.bs);
        await localeRadio(page, 'en').click();
        await expect(page.getByTestId('privacy-notice-textarea-en')).toHaveValue(original.notice.en);
        await localeRadio(page, 'bs').click();
        await expect(page.getByTestId('privacy-notice-textarea-bs')).toHaveValue(original.notice.bs);
      });

      await test.step('generate the draft from the record of processing', async () => {
        await page.getByTestId('privacy-notice-generate').click();
        const generated = await page.getByTestId('privacy-notice-textarea-bs').inputValue();
        expect(generated.length).toBeGreaterThan(0);
        expect(generated.length).toBeLessThanOrEqual(original.maxLength);
        await expect(page.getByTestId('privacy-notice-counter-bs')).toContainText(`${generated.length}`);
      });

      await test.step('save and see the published badge', async () => {
        await page.getByTestId('privacy-notice-save').click();
        await expect(page.getByTestId('privacy-notice-state-badge')).toHaveText(/Objavljeno|Published/i);
      });

      await test.step('the public page shows the saved text without the draft badge', async () => {
        await page.goto('/privacy-notice');
        await expect(page.getByTestId('privacy-notice-content')).toBeVisible();
        await expect(page.getByTestId('privacy-notice-draft-badge')).toHaveCount(0);
        await expect(page.getByTestId('privacy-notice-content')).toContainText(
          /Obavještenje o obradi ličnih podataka|Privacy notice/i,
        );
      });

      await test.step('both languages empty falls back to the flagged draft', async () => {
        // The fallback chain is own text -> the other language -> generated
        // draft, so the draft badge appears only when BOTH are empty.
        await api.requestJson<NoticeStatus>('/privacy/notice', {
          method: 'PUT',
          body: JSON.stringify({ bs: '', en: '' }),
        });
        const served = await api.requestJson<{ readonly draft: boolean; readonly fallbackLocale: boolean }>(
          '/privacy/notice?locale=bs',
        );
        expect(served.draft).toBe(true);
        expect(served.fallbackLocale).toBe(false);
        // The public page is served with `Cache-Control: max-age=300`; a fresh
        // context guarantees the UI reads the new state, not the cached one.
        const browser = page.context().browser();
        if (browser === null) throw new Error('[e2e] a browser instance is required.');
        const fresh = await browser.newContext();
        try {
          const freshPage = await fresh.newPage();
          await freshPage.goto(new URL('/privacy-notice', page.url()).toString());
          await expect(freshPage.getByTestId('privacy-notice-draft-badge')).toBeVisible();
        } finally {
          await fresh.close();
        }
      });
    } finally {
      await api.requestJson<NoticeStatus>('/privacy/notice', {
        method: 'PUT',
        body: JSON.stringify({ bs: original.notice.bs, en: original.notice.en }),
      });
      // Verify the restore through the API (deterministic), then a light UI
      // check of the default language textarea.
      const restored = await api.requestJson<NoticeStatus>('/privacy/notice/status');
      expect(restored.notice).toEqual(original.notice);
      await page.goto('/privacy?tab=notice');
      await expect(page.getByTestId('privacy-notice-textarea-bs')).toHaveValue(original.notice.bs);
    }
  });

  test('the settings row for the notice leads to the dedicated editor', async ({ page }) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(30_000);
    const env = readE2EEnvironment();

    await test.step('sign in and open the settings registry', async () => {
      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      await page.goto('/settings');
    });

    await test.step('open the notice key and follow the editor link', async () => {
      const search = page.getByTestId('settings-registry-search');
      await search.fill('private.privacy.notice.bs');
      const row = page.getByTestId('setting-row-private.privacy.notice.bs').first();
      await expect(row).toBeVisible();
      await row.click();
      const link = page.getByTestId('setting-detail-notice-editor-link');
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(/\/privacy\?tab=notice$/);
      await expect(page.getByTestId('privacy-notice-editor')).toBeVisible();
    });
  });
});
