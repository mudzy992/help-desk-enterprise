import type { Page } from '@playwright/test';

/*
  F6 — the wizard's own submit controls.

  Every install step renders exactly one primary control inside its own `<form>`
  (`<Button type="submit">`), but the label is copy, and copy is not a contract.
  The first live run died for three minutes on the SuperAdmin step because its
  button says „Dalje“ and the pattern only knew „Nastavi“/„Continue“ — so the
  label is a hint: when the name does not resolve, the step form's own submit
  button answers instead, with a budget short enough to keep a failure readable.
*/

/** The labels the steps use for „save and move on“ (Bosnian first: a fresh install is `bs`). */
export const submitPattern =
  /dalje|nastavi|continue|next|sačuvaj|save|kreiraj|create|primijeni|apply|potvrdi|confirm/i;

/** Long enough for a slow stack, short enough that a missing button is not the whole timeout. */
const submitTimeoutMs = 15_000;

/** Clicks the step's submit control: by label first, then the form's own submit button. */
export async function clickStepSubmit(page: Page, name: RegExp = submitPattern): Promise<void> {
  try {
    await page.getByRole('button', { name }).first().click({ timeout: submitTimeoutMs });
    return;
  } catch (error) {
    try {
      // The step's form renders before the shell's footer, so `first()` is the step's own.
      await page.locator('form button[type="submit"]').first().click({ timeout: submitTimeoutMs });
      return;
    } catch {
      // The labelled failure is the meaningful one: it names what was looked for.
      throw error;
    }
  }
}
