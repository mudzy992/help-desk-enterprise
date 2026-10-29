import type { Page } from '@playwright/test';
import { reachStep } from './install-wizard-step-reader';
import { clickStepSubmit } from './install-wizard-submit';

/*
  F6 — the two steps the spec has to *type* into, not just click through.

  They sit apart from `install-wizard-actions.ts` because they carry the lesson of both
  live runs: the shell renders a step's `h1` before the step's own state arrives (the body
  is a `PanelSkeleton`), so a control that is missing the moment `reachStep` sees the
  heading is not a control that will never be there. Wait for the body, then act on it —
  and fill every `required` field, because the browser silently swallows a submit that
  leaves one empty.
*/

/**
 * The names the structure step creates the first service from. They are the server's
 * own defaults (`install-seed.names.ts`), so the slugs the rest of the suite resolves
 * the service by (`opsti-zahtjev`) stay the ones `ensure-install.ts` used before v2.
 */
const structureNames = {
  organizationalUnitName: 'Direkcija',
  handlerGroupName: 'Fallback',
  serviceName: 'Opšti zahtjev',
} as const;

/**
 * „Struktura i prvi servis“: the step becomes a summary once the records exist, so there
 * is nothing to create on a reopened installation. On a fresh one it offers a form whose
 * three names are `required` and empty — a fresh record has no unit, group or service to
 * prefill them from — so the spec types what an operator types. Asking „is the button
 * there?“ before the body arrives answered „no“ on every run, and the helper returned
 * quietly while the form rendered a moment later; that is why this waits for the step's
 * own form (the only `form button[type="submit"]` on screen) or for the sentence the step
 * shows when the records exist.
 */
export async function createStructure(page: Page): Promise<void> {
  if (!(await reachStep(page, 'seed'))) return;
  const form = page.locator('form button[type="submit"]');
  const appeared = await form
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) {
    const summary = page.getByText(/struktura je spremna|the structure is ready/i);
    if (await summary.first().isVisible().catch(() => false)) return;
    throw new Error(
      '[install-wizard] the structure step showed neither its form nor its summary',
    );
  }
  await page
    .getByLabel(/organizacijska jedinica|organisational unit/i)
    .fill(structureNames.organizationalUnitName);
  await page
    .getByLabel(/grupa koja prima tikete|group that receives tickets/i)
    .fill(structureNames.handlerGroupName);
  await page.getByLabel(/^servis$|^service$/i).fill(structureNames.serviceName);
  await clickStepSubmit(page, /kreiraj strukturu|create the structure/i);
}

/** „Tim“: one AGENT, created through the step's own form. */
export async function addTeamMember(
  page: Page,
  member: { readonly displayName: string; readonly email: string },
): Promise<void> {
  if (!(await reachStep(page, 'team'))) return;
  await page.getByLabel(/ime i prezime|full name|display name/i).first().fill(member.displayName);
  // The row labels its fields „Email 1“ / „E-mail 1“, so the pattern cannot be anchored.
  await page.getByLabel(/e-?mail/i).first().fill(member.email);
  await clickStepSubmit(page, /kreiraj naloge|create the accounts/i);
}
