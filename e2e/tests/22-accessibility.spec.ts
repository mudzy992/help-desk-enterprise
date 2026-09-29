import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations, loadA11yExceptions, useColourMode } from '../helpers/a11y';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

/**
 * Paket 2.8 (§5.1, E2E 22): axe on the key flows (T1-T6) and an admin sample
 * for USER, AGENT and SUPER_ADMIN in light and dark mode, plus the keyboard
 * contract: skip link, focus on route change, unique tab titles, shortcuts
 * (on by default for staff, off for USER, switchable) and keyboard-only reply.
 */
const MODES = ['light', 'dark'] as const;

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.locator('#main-content h1').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
  // Entrance animations (fade/pop) would otherwise be measured half-transparent.
  await page.waitForTimeout(400);
}

async function scan(page: Page, path: string, label: string, testInfo: Parameters<typeof expectNoSeriousA11yViolations>[2]): Promise<void> {
  await page.goto(path);
  await settle(page);
  await expectNoSeriousA11yViolations(page, label, testInfo);
}

let ticketId = '';

test.beforeAll(async () => {
  const env = readE2EEnvironment();
  const user = new ApiClient();
  await user.login(env.userEmail, env.userPassword);
  const seed = await loadSeedCatalog(user);
  const ticket = await createTicketViaApi(user, {
    title: `E2E a11y ${Date.now()}`,
    serviceId: seed.serviceId,
    formVersionRef: seed.formVersionRef,
  });
  ticketId = ticket.id;
  // Start every run from the role default.
  await user.request('/users/me/preferences', { method: 'PATCH', body: JSON.stringify({ keyboardShortcuts: null }) });
});

test.describe('22 accessibility', () => {
  test('the exceptions file is valid', () => {
    expect(() => loadA11yExceptions()).not.toThrow();
  });

  for (const mode of MODES) {
    test(`login page has no serious findings (${mode})`, async ({ page }, testInfo) => {
      await useColourMode(page, mode);
      await page.goto('/login');
      await page.locator('#login-email, #session-email').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      await expectNoSeriousA11yViolations(page, `login-${mode}`, testInfo);
    });

    test(`USER key flows have no serious findings (${mode})`, async ({ page }, testInfo) => {
      const env = readE2EEnvironment();
      await useColourMode(page, mode);
      await signIn(page, env.userEmail, env.userPassword);
      await scan(page, '/', `user-dashboard-${mode}`, testInfo);
      await scan(page, '/tickets', `user-tickets-${mode}`, testInfo);
      await scan(page, '/tickets/new', `user-new-ticket-${mode}`, testInfo);
      await scan(page, `/tickets/${ticketId}`, `user-ticket-detail-${mode}`, testInfo);
      await scan(page, '/status', `user-status-${mode}`, testInfo);
      await scan(page, '/knowledge-base', `user-knowledge-${mode}`, testInfo);
      await scan(page, '/appearance', `user-appearance-${mode}`, testInfo);
      await scan(page, '/account/security', `user-security-${mode}`, testInfo);
      await scan(page, '/account/notifications', `user-notifications-${mode}`, testInfo);
    });

    test(`AGENT key flows have no serious findings (${mode})`, async ({ page }, testInfo) => {
      const env = readE2EEnvironment();
      await useColourMode(page, mode);
      await signIn(page, env.agentEmail, env.agentPassword);
      await scan(page, '/', `agent-dashboard-${mode}`, testInfo);
      await scan(page, '/tickets?view=all', `agent-tickets-${mode}`, testInfo);
      await scan(page, `/tickets/${ticketId}`, `agent-ticket-detail-${mode}`, testInfo);
    });

    test(`SUPER_ADMIN admin sample has no serious findings (${mode})`, async ({ page }, testInfo) => {
      const env = readE2EEnvironment();
      await useColourMode(page, mode);
      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      for (const [path, name] of [
        ['/settings', 'settings'],
        ['/users', 'users'],
        ['/reports', 'reports'],
        ['/privacy', 'privacy'],
        ['/admin', 'admin'],
        ['/admin/queue', 'queue'],
        ['/admin/workflow', 'workflow'],
      ] as const) {
        await scan(page, path, `admin-${name}-${mode}`, testInfo);
      }
    });
  }

  test('skip link, focus on route change and unique tab titles', async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.agentEmail, env.agentPassword);
    await page.goto('/');
    await settle(page);

    await page.keyboard.press('Tab');
    const skip = page.locator(':focus');
    await expect(skip).toHaveAttribute('href', '#main-content');
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();

    const dashboardTitle = await page.title();
    await page.locator('aside a[href="/knowledge-base"]').first().click();
    await expect(page).toHaveURL(/\/knowledge-base/);
    await expect(page.locator('#main-content h1').first()).toBeFocused({ timeout: 10_000 });
    const heading = (await page.locator('#main-content h1').first().innerText()).trim();
    await expect.poll(() => page.title()).toContain(heading);
    expect(await page.title()).not.toBe(dashboardTitle);
  });

  test('shortcuts: on for AGENT (help, G then T), off by default for USER and switchable', async ({ page, browser }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.agentEmail, env.agentPassword);
    await page.goto('/');
    await settle(page);
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByTestId('shortcuts-help')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('g');
    await page.keyboard.press('t');
    await expect(page).toHaveURL(/\/tickets/);

    const context = await browser.newContext();
    const userPage = await context.newPage();
    await signIn(userPage, env.userEmail, env.userPassword);
    await userPage.goto('/');
    await settle(userPage);
    await userPage.keyboard.press('n');
    await userPage.waitForTimeout(500);
    expect(new URL(userPage.url()).pathname).not.toBe('/tickets/new');

    await userPage.goto('/appearance#accessibility');
    const preferences = userPage.getByTestId('accessibility-preferences');
    await preferences.getByRole('radio', { name: /^(uključeno|on)$/i }).click();
    await expect(userPage.getByTestId('a11y-announcer-polite')).toContainText(/uključene|on/i, { timeout: 10_000 });
    await userPage.goto('/');
    await settle(userPage);
    await userPage.keyboard.press('n');
    await expect(userPage).toHaveURL(/\/tickets\/new/);

    const user = new ApiClient();
    await user.login(env.userEmail, env.userPassword);
    await user.request('/users/me/preferences', { method: 'PATCH', body: JSON.stringify({ keyboardShortcuts: null }) });
    await context.close();
  });

  // Staff reply; SUPER_ADMIN is used because the seeded agent may be outside the ticket's scope.
  test('staff replies with the keyboard only (R, type, Ctrl+Enter)', async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(`/tickets/${ticketId}`);
    await settle(page);
    await page.locator('#main-content h1').first().focus();
    await page.keyboard.press('r');
    const editor = page.getByTestId('ticket-composer-body');
    await expect(editor).toBeFocused();
    const text = `E2E keyboard reply ${Date.now()}`;
    await page.keyboard.type(text);
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('#ticket-conversation')).toContainText(text, { timeout: 15_000 });
    await expect(page.locator('#ticket-conversation article').last()).toHaveAttribute('aria-label', /.+/);
  });
});
