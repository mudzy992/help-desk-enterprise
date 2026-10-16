import { expect, type Locator, type Page } from '@playwright/test';

/*
  F6 — reading the install wizard's own screens.

  The shell renders every step's headline as the page `h1` (`install-step-
  presentation.ts` owns the keys, `install.<step>.heading` or
  `install.section.<key>.title`). Selectors match the Bosnian copy with the
  English one as the alternative, the way `helpers/sign-in.ts` and the rest of
  the suite do: a fresh installation defaults to `bs`, but a deployment may
  switch the locale before the wizard runs.
*/

/** The step headlines of the wizard, in the order the registry declares them. */
const wizardOrder = [
  'profile',
  'superAdmin',
  'identity',
  'loginProvider',
  'smtp',
  'seed',
  'team',
  'blueprint',
  'policyPack',
  'slaReview',
  'securityRecommendations',
  'addons',
  'provisioning',
  'complete',
] as const;

export type WizardStep = (typeof wizardOrder)[number];

const stepHeadings: Readonly<Record<WizardStep, RegExp>> = {
  profile: /paket instalacije|installation package/i,
  superAdmin: /superadmin nalog|superadmin account/i,
  identity: /identitet instalacije|installation identity/i,
  loginProvider: /način prijave|sign-in method/i,
  smtp: /^smtp$/i,
  seed: /struktura i prvi servis|structure and the first service/i,
  team: /^tim$|^team$/i,
  blueprint: /katalog iz predloška|catalog from a template/i,
  policyPack: /paket prava|permission pack/i,
  slaReview: /radno vrijeme i prioriteti|business hours and priorities/i,
  securityRecommendations: /preporuke za produkciju|production recommendations/i,
  addons: /dodaci|add-ons/i,
  provisioning: /provjera spremnosti|readiness checks/i,
  complete: /sistem je spreman|the system is ready/i,
};

/** Every step the wizard may show instead of the one a helper is about to answer. */
function stepsAfter(step: WizardStep): readonly RegExp[] {
  return wizardOrder.slice(wizardOrder.indexOf(step) + 1).map((key) => stepHeadings[key]);
}

/** Waits until the shell shows this step. */
export async function expectStep(page: Page, step: WizardStep): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(stepHeadings[step], {
    timeout: 20_000,
  });
}

/**
 * The step a helper is about to answer, or `false` when the wizard has already
 * walked past it. A step whose state lives in real rows (the SuperAdmin, the
 * identity, the sign-in mode, the initial data, the team) stays answered when a
 * finished installation is reopened, so a spec that insisted on seeing it would
 * fail on a re-armed stack while the wizard works exactly as designed.
 */
export async function reachStep(page: Page, step: WizardStep): Promise<boolean> {
  const heading = page.getByRole('heading', { level: 1 });
  const later = stepsAfter(step);
  const deadline = Date.now() + 20_000;
  let seen = '';
  while (Date.now() < deadline) {
    seen = ((await heading.textContent().catch(() => '')) ?? '').trim();
    if (stepHeadings[step].test(seen)) return true;
    if (later.some((pattern) => pattern.test(seen))) return false;
    await page.waitForTimeout(250);
  }
  throw new Error(
    `[install-wizard] expected the step ${String(stepHeadings[step])}, saw "${seen}"`,
  );
}

/** The rows of the readiness list (F6.1) — its own list, not the rail's. */
export function readinessRows(page: Page): Locator {
  return page.locator('ul[aria-live="polite"] li');
}

export { stepHeadings, wizardOrder };
