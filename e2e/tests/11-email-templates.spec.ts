import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type Rendered = { readonly subject: string; readonly html: string; readonly text: string };
type Overview = {
  readonly keys: readonly string[];
  readonly overrides: Record<string, unknown>;
  readonly templates: Record<string, Record<string, { heading: string }>>;
};

const marker = 'E2E naslov uvoda';

/**
 * Package 1.5 (G7): the admin edits an e-mail text, sees it in the live preview
 * (HTML in a sandboxed iframe), saves it with a reason; afterAll restores the defaults. The API
 * part checks the confidential rendering (E3) and the placeholder guard.
 * Real sending is covered by unit tests; the test endpoint needs a live SMTP.
 */
test.describe('11 e-mail templates', () => {
  test.afterAll(async () => {
    // Leave the installation on the built-in texts whatever happened above.
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    await api.requestJson('/settings/email-templates', {
      method: 'PUT',
      body: JSON.stringify({ overrides: {}, reason: 'E2E cleanup' }),
    });
  });

  test('API: preview hides confidential data and refuses unknown placeholders', async () => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);

    const overview = await api.requestJson<Overview>('/settings/email-templates');
    expect(overview.keys).toContain('ticket.broadcast');

    const normal = await api.requestJson<Rendered>('/settings/email-templates/preview', {
      method: 'POST',
      body: JSON.stringify({ key: 'ticket.message', locale: 'bs' }),
    });
    expect(normal.subject).toMatch(/^\[HD-2026-000123\] /);
    expect(normal.html).toContain('<!DOCTYPE html>');
    expect(normal.text).toContain('VPN ne radi');

    const confidential = await api.requestJson<Rendered>('/settings/email-templates/preview', {
      method: 'POST',
      body: JSON.stringify({ key: 'ticket.message', locale: 'en', confidential: true }),
    });
    expect(confidential.text).not.toContain('VPN stopped');
    expect(confidential.html).toContain('Confidential');

    const refused = await api.request('/settings/email-templates/preview', {
      method: 'POST',
      body: JSON.stringify({
        key: 'ticket.created',
        locale: 'bs',
        content: { subject: 'Lozinka {{password}}' },
      }),
    });
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain('INVALID_EMAIL_TEMPLATE');
  });

  test('UI: edit → live preview → placeholder guard → save with reason', async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/admin?tab=settings');

    const card = page.getByTestId('email-templates-card');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole('button').last().click();
    await expect(page).toHaveURL(/\/admin\/email-templates/);
    await expect(page.getByTestId('email-templates-editor')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('email-template-key').selectOption('ticket.assigned');
    // Per-template accent colour reaches the preview.
    await page.getByTestId('email-template-field-accentColor').fill('#16a34a');
    await expect(page.frameLocator('iframe[sandbox]').locator('body')).toContainText(/./);
    const heading = page.getByTestId('email-template-field-heading');
    await heading.fill(marker);

    const frame = page.frameLocator('iframe[sandbox]');
    await expect(frame.locator('h1')).toHaveText(marker, { timeout: 10_000 });
    await expect(page.getByTestId('email-template-preview-subject')).toContainText(
      'HD-2026-000123',
    );

    // Unknown placeholder: live warning, no save offered.
    await heading.fill(`${marker} {{nope}}`);
    await expect(page.getByRole('alert').first()).toContainText('{{nope}}');
    await heading.fill(marker);

    const reason = page.getByLabel(/razlog|reason/i).last();
    await reason.fill('E2E: provjera šablona');
    await reason.locator('xpath=..').getByRole('button').last().click();

    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    await expect
      .poll(async () => {
        const overview = await api.requestJson<Overview>('/settings/email-templates');
        return overview.templates.bs?.['ticket.assigned']?.heading;
      })
      .toBe(marker);
  });
});
