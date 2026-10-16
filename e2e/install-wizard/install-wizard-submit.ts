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
  const before = await readStepHeading(page);
  try {
    await page.getByRole('button', { name }).first().click({ timeout: submitTimeoutMs });
  } catch (error) {
    try {
      // The step's form renders before the shell's footer, so `first()` is the step's own.
      await page.locator('form button[type="submit"]').first().click({ timeout: submitTimeoutMs });
    } catch {
      // The labelled failure is the meaningful one: it names what was looked for.
      throw error;
    }
  }
  await assertStepFormSubmitted(page);
  await assertStepAdvanced(page, before);
}

/** The step's `h1` — empty when the page is mid-transition or has more than one. */
async function readStepHeading(page: Page): Promise<string> {
  const heading = await page
    .getByRole('heading', { level: 1 })
    .textContent()
    .catch(() => '');
  return (heading ?? '').trim();
}

/**
 * A `required` field a helper forgot to fill does not throw: the browser blocks the
 * submit, React never runs, and the wizard stays on the step until the wait expires
 * (that is how the first live run of spec 51 lost its wait on „Struktura i prvi
 * servis“). `:invalid` right after the click therefore means the request was never
 * sent — name the field instead of leaving a silent screen behind.
 */
async function assertStepFormSubmitted(page: Page): Promise<void> {
  const blocked = await page.evaluate(() =>
    Array.from(document.querySelectorAll('form :invalid'))
      .slice(0, 4)
      .map((control) => {
        const field = control as HTMLInputElement;
        const label = field.labels?.[0]?.textContent ?? field.getAttribute('name');
        return (label ?? field.tagName).trim().replace(/\s+/g, ' ').slice(0, 60);
      }),
  );
  if (blocked.length === 0) return;
  throw new Error(
    `[install-wizard] the step form blocked the submit: ${blocked.join('; ')} — ` +
      'those fields are `required` and the helper has to fill them.',
  );
}

/**
 * „The click did nothing“ is the failure a log cannot explain: the step stays on screen
 * and the *next* helper reports a headline mismatch, which is what both live runs of
 * spec 51 did. Requiring the headline to change after the submit turns that into the
 * page's own words — its `role="alert"` text, or „no error“ when the screen is quiet.
 */
async function assertStepAdvanced(page: Page, before: string): Promise<void> {
  if (before.length === 0) return;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const now = await readStepHeading(page);
    if (now.length > 0 && now !== before) return;
    await page.waitForTimeout(250);
  }
  const alerts = (await page.getByRole('alert').allTextContents())
    .map((text) => text.trim().replace(/\s+/g, ' '))
    .filter((text) => text.length > 0);
  throw new Error(
    `[install-wizard] the step „${before}“ did not move on after its submit — ` +
      (alerts.length > 0 ? `the page says: ${alerts.join(' / ')}` : 'the page shows no error'),
  );
}
