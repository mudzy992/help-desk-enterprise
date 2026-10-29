import { expect, test } from '@playwright/test';
import { readE2EEnvironment } from '../helpers/environment';
import { dismissAnnouncementModal, signIn } from '../helpers/sign-in';

test.describe('55 session refresh preserves unsaved work', () => {
  test('real /auth/refresh does not redirect, remount, show a skeleton, or clear the draft', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/tickets/new');
    await dismissAnnouncementModal(page);
    await page.getByText(/opšti zahtjev|general request/i).first().click();
    await page.getByRole('button', { name: /dalje|next|nastavi/i }).click();

    const title = page.getByLabel(/naslov|title/i);
    const draft = `Unsaved refresh proof ${Date.now()}`;
    await title.fill(draft);
    const titleNode = await title.elementHandle();
    expect(titleNode).not.toBeNull();
    const urlBefore = page.url();
    let mainFrameNavigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) mainFrameNavigations += 1;
    });

    await page.evaluate(() => {
      const key = 'service-desk.session';
      const raw = window.localStorage.getItem(key);
      if (raw === null) throw new Error('Authenticated page has no stored session metadata');
      const session = JSON.parse(raw) as Record<string, unknown>;
      session.expiresAt = Date.now() + 5 * 60_000;
      window.localStorage.setItem(key, JSON.stringify(session));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    });

    const refresh = await page.waitForResponse(
      (response) => response.url().includes('/auth/refresh') && response.request().method() === 'POST',
      { timeout: 65_000 },
    );
    expect(refresh.ok()).toBe(true);
    expect(page.url()).toBe(urlBefore);
    expect(mainFrameNavigations).toBe(0);
    await expect(title).toHaveValue(draft);
    expect(await titleNode?.evaluate((node) => node.isConnected)).toBe(true);
    await expect(page.locator('[data-testid*="skeleton" i]:visible, .animate-pulse:visible')).toHaveCount(0);
  });
});
