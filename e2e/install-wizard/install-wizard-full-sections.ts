import type { Page } from '@playwright/test';
import { fullSectionSteps, reachStep } from './install-wizard-step-reader';

/**
 * Full package (F5): every `section.*` step is skippable. Spec 53 defers them all
 * so readiness stays green and the post-install checklist names what was left open
 * — the same acceptance the backend `install-full-package.acceptance` suite pins.
 */
export async function deferFullPackageSections(page: Page): Promise<void> {
  for (const step of fullSectionSteps) {
    if (!(await reachStep(page, step))) continue;
    await page.getByRole('button', { name: /podesi kasnije|configure later/i }).click();
  }
}
