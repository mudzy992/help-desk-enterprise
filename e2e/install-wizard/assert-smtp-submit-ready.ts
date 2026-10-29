import { expect, type Page } from '@playwright/test';

/** Fail fast when blank E2E_SMTP_* left host/port empty and Dalje disabled. */
export async function assertSmtpSubmitReady(page: Page): Promise<void> {
  const submit = page.locator('form button[type="submit"]').first();
  try {
    await expect(submit).toBeEnabled({ timeout: 5_000 });
  } catch {
    const host = await page.getByLabel(/smtp host/i).inputValue();
    const port = await page.getByLabel(/smtp port/i).inputValue();
    const user = await page.getByLabel(/smtp korisnik|smtp username/i).inputValue();
    const from = await page.getByLabel(/from adresa|from address/i).inputValue();
    throw new Error(
      `[install-wizard] SMTP „Dalje“ stayed disabled after fill ` +
        `(host=${JSON.stringify(host)} port=${JSON.stringify(port)} ` +
        `user=${JSON.stringify(user)} from=${JSON.stringify(from)}). ` +
        'Set non-empty E2E_SMTP_HOST/PORT/USERNAME/PASSWORD/FROM for specs 52/53.',
    );
  }
}
