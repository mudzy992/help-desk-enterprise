import { expect, type Page } from '@playwright/test';
import { clickStepSubmit } from './install-wizard-submit';
import {
  expectStep,
  reachStep,
  readinessRows,
  type WizardStep,
} from './install-wizard-step-reader';
import { isPlainSmtpCatcher } from './smtp-catcher';

/*
  F6 — the install wizard, answered through its own UI. Every helper waits for the
  step it is about to answer and returns quietly when the wizard has walked past it
  (`reachStep`), so one spec runs against an empty database and a reopened
  installation alike — pressing only buttons an operator presses.
*/

/** Opens `/install` and answers the token gate. */
export async function openWizard(page: Page, token: string): Promise<void> {
  await page.goto('/install');
  const field = page.locator('#install-token');
  await field.fill(token);
  await page.locator('form').filter({ has: field }).locator('button[type="submit"]').click();
  await field.waitFor({ state: 'detached', timeout: 20_000 });
  await expectStep(page, 'profile');
}

/**
 * „Izbor paketa“ (F3): the card behaves as a radio and its own save moves the wizard
 * on. Cards render in package order, so the first that mentions the title carries it.
 */
export async function choosePackage(page: Page, title: RegExp): Promise<void> {
  await expectStep(page, 'profile');
  // Match the package title node (not the whole card text): Full sits below the
  // fold, and a loose `hasText` on the card used to miss it while Minimum/Standard
  // still resolved.
  const titleNode = page.getByText(title).first();
  await titleNode.scrollIntoViewIfNeeded();
  await expect(titleNode).toBeVisible();
  const card = page.locator('div.rounded-lg.border').filter({ has: titleNode }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /izaberi|select/i }).click();
  await page.getByRole('button', { name: /nastavi s paketom|continue with this package/i }).click();
}

/** „SuperAdmin“: the local break-glass account the wizard creates first. */
export async function fillSuperAdmin(
  page: Page,
  input: { readonly email: string; readonly password: string; readonly displayName: string },
): Promise<void> {
  if (!(await reachStep(page, 'superAdmin'))) return;
  await page.getByLabel(/^email$/i).fill(input.email);
  await page.getByLabel(/ime i prezime|full name|display name/i).fill(input.displayName);
  await page.getByLabel(/^lozinka$|^password$/i).fill(input.password);
  await page.getByLabel(/potvrda lozinke|confirm password/i).fill(input.password);
  await clickStepSubmit(page);
}

/** „Identitet“ (F2): the name the installation will show on the sign-in page. */
export async function saveIdentity(
  page: Page,
  input: { readonly organizationName: string; readonly timeZone: string },
): Promise<void> {
  if (!(await reachStep(page, 'identity'))) return;
  await page.getByLabel(/naziv organizacije|organi[sz]ation name/i).fill(input.organizationName);
  await page.getByLabel(/vremenska zona|time zone/i).fill(input.timeZone);
  await clickStepSubmit(page, /sačuvaj identitet|save identity/i);
}

/** „Način prijave“: local accounts — the SuperAdmin stays the break-glass one. */
export async function chooseLocalSignIn(page: Page): Promise<void> {
  if (!(await reachStep(page, 'loginProvider'))) return;
  await page.getByRole('radio', { name: /lokalni nalozi|local accounts/i }).check();
  await clickStepSubmit(page);
}

/**
 * „SMTP“: the step's test mail is the operator's proof that mail leaves the
 * installation. Returns whether the stack accepted it — without a mail catcher the
 * spec defers the step and says so.
 */
export async function fillSmtp(
  page: Page,
  smtp: {
    readonly host: string;
    readonly port: string;
    readonly username: string;
    readonly password: string;
    readonly from: string;
  },
): Promise<boolean> {
  if (!(await reachStep(page, 'smtp'))) return false;
  const enabled = page.getByRole('switch', { name: /smtp omogućen|smtp enabled/i });
  if ((await enabled.getAttribute('aria-checked')) !== 'true') {
    await enabled.click();
  }
  await page.getByLabel(/smtp host/i).fill(smtp.host);
  await page.getByLabel(/smtp port/i).fill(smtp.port);
  // Mailpit/GreenMail on loopback/plain ports need TLS off; Gmail (587/465) needs it on.
  const tls = page.getByRole('switch', { name: /tls|starttls/i });
  const tlsOn = (await tls.getAttribute('aria-checked')) === 'true';
  const plainCatcher = isPlainSmtpCatcher(smtp.host, smtp.port);
  if (plainCatcher && tlsOn) {
    await tls.click();
  } else if (!plainCatcher && !tlsOn) {
    await tls.click();
  }
  await page.getByLabel(/smtp korisnik|smtp username/i).fill(smtp.username);
  await page.getByLabel(/smtp lozinka|smtp password/i).fill(smtp.password);
  await page.getByLabel(/from adresa|from address/i).fill(smtp.from);

  // F4.1: the test send reads *stored* settings, so the form must be saved
  // first (that advances the wizard). Review the step, send the test, then
  // leave the review with the shell's „Nastavi“.
  await clickStepSubmit(page);
  await page.getByRole('button', { name: /nazad|back/i }).click();
  await expectStep(page, 'smtp');
  const sendTest = page.getByRole('button', { name: /pošalji test|send test/i });
  await sendTest.waitFor({ state: 'visible', timeout: 20_000 });
  await expect(sendTest).toBeEnabled({ timeout: 20_000 });
  await sendTest.click();
  const passed = await page
    .getByText(/poslano na|sent to/i)
    .waitFor({ state: 'visible', timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  await page.getByRole('button', { name: /nastavi|continue/i }).click();
  return passed;
}

/** „Podesi kasnije“ on the step on screen (the footer offers it when `skippable`). */
export async function deferStep(page: Page, step: WizardStep): Promise<void> {
  if (!(await reachStep(page, step))) return;
  await page.getByRole('button', { name: /podesi kasnije|configure later/i }).click();
}

/** „Katalog iz predloška“: a blueprint radio, then the step's apply button. */
export async function applyBlueprint(page: Page, templateTitle: RegExp): Promise<void> {
  if (!(await reachStep(page, 'blueprint'))) return;
  await page.getByRole('radio', { name: templateTitle }).first().check();
  await clickStepSubmit(page, /primijeni predložak|apply (the )?template/i);
}

/** „Paket prava“: the IT pack, then apply (this step cannot be deferred). */
export async function applyPolicyPack(page: Page, packTitle: RegExp): Promise<void> {
  if (!(await reachStep(page, 'policyPack'))) return;
  await page.getByRole('radio', { name: packTitle }).first().check();
  await clickStepSubmit(page, /primijeni paket|apply (the )?pack/i);
}

/** „Radno vrijeme i prioriteti“: keep the seeded defaults. */
export async function confirmSlaDefaults(page: Page): Promise<void> {
  if (!(await reachStep(page, 'slaReview'))) return;
  await clickStepSubmit(page, /potvrđujem podrazumijevano|i confirm the defaults/i);
}

/** „Primijeni preporuke za produkciju“ (F5, owner decision 7). */
export async function applySecurityRecommendations(page: Page): Promise<void> {
  if (!(await reachStep(page, 'securityRecommendations'))) return;
  await clickStepSubmit(page, /primijeni preporuke|apply (the )?(production )?recommendations/i);
}

/** „Dodaci“: save what the package preselects. */
export async function saveAddons(page: Page): Promise<void> {
  if (!(await reachStep(page, 'addons'))) return;
  await clickStepSubmit(page);
}

/**
 * F6.1 — the readiness screen. The finish button exists only while every check is
 * green, so the red lines are returned instead of timing out on a missing button.
 */
export async function finishInstallation(page: Page): Promise<readonly string[]> {
  await expectStep(page, 'provisioning');
  const finish = page.getByRole('button', {
    name: /završi instalaciju|finish (the )?installation/i,
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await finish.isVisible().catch(() => false)) {
      await finish.click();
      return [];
    }
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/install/readiness'), {
        timeout: 20_000,
      }),
      page.getByRole('button', { name: /provjeri ponovo|check again/i }).click(),
    ]);
  }
  return readinessRows(page).filter({ hasText: /nedostaje|missing/i }).allTextContents();
}

/** F6.2 — the ready screen offers sign-in and never finishes anything itself. */
export async function expectReadyScreen(page: Page): Promise<void> {
  await expectStep(page, 'complete');
  await expect(page.getByRole('link', { name: /prijavite se|sign in/i })).toBeVisible();
}
