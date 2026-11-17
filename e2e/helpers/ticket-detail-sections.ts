import { expect, type Locator } from '@playwright/test';

/**
 * The ticket detail rail renders every panel through `DetailSection`
 * (`frontend/src/components/tickets/detail-section.tsx`), and three sections
 * start **collapsed**: form data, problem links and related tickets
 * (`frontend/src/lib/tickets/detail-sections.ts`). Their body carries `hidden`
 * until the header is clicked, so a locator resolves and stays invisible.
 *
 * Nightly run 44049572740 (2026-11-17) reported exactly that in spec 30:
 * `getByText('P-000014').first()` resolved to
 * `<a class="block truncate font-medium text-link">P-000014 · E2E problem …</a>`
 * 26 times with "unexpected value hidden" — the panel was correct, the spec just
 * never opened its section.
 *
 * Takes the section itself (`page.getByTestId('ticket-problem-panel')`), so the
 * click can never land on a toggle in another panel.
 */
export async function openDetailSection(section: Locator): Promise<void> {
  await expect(section).toBeVisible();
  const collapsed = section.getByRole('button', { expanded: false });
  if ((await collapsed.count()) === 0) {
    return;
  }
  await collapsed.first().click();
  await expect(section.getByRole('button', { expanded: false })).toHaveCount(0);
}
