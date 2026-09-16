import type { Page } from '@playwright/test';

export async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/');
  await page.locator('#session-email').fill(email);
  await page.locator('#session-password').fill(password);
  await page.locator('form').filter({ has: page.locator('#session-email') }).locator('button[type="submit"]').click();
  await page.waitForSelector('#session-email', { state: 'detached', timeout: 20_000 });
}
