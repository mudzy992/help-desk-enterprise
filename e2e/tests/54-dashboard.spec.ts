import { expect, test } from "@playwright/test";
import { readE2EEnvironment } from "../helpers/environment";
import { signIn } from "../helpers/sign-in";

const OPEN_STATUSES = [
  "PENDING",
  "UNROUTED",
  "ASSIGNED",
  "IN_PROGRESS",
] as const;

function queryOf(href: string): URLSearchParams {
  return new URL(href, "http://dashboard.local").searchParams;
}

test.describe("54 dashboard contracts", () => {
  test("AGENT metric cards preserve the canonical list contract", async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.agentEmail, env.agentPassword);
    await page.goto("/");

    const open = page
      .locator('a[href*="view=all"]')
      .filter({ hasText: /otvoreni tiketi|open tickets/i });
    const critical = page.locator('a[href*="priority=CRITICAL"]');
    const unrouted = page.locator(
      'a[href="/tickets?view=inbox&inboxTab=unrouted"]',
    );
    await expect(open).toBeVisible();
    await expect(critical).toBeVisible();
    await expect(unrouted).toBeVisible();

    expect(
      queryOf((await open.getAttribute("href")) ?? "").getAll("status"),
    ).toEqual(OPEN_STATUSES);
    expect(
      queryOf((await critical.getAttribute("href")) ?? "").getAll("status"),
    ).toEqual(OPEN_STATUSES);

    await critical.click();
    await expect(page).toHaveURL(/priority=CRITICAL/);
    await expect(page.locator("#main-content")).toContainText(
      /kritič|critical/i,
    );
  });

  test("USER dashboard hides staff-only queue surfaces", async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.userEmail, env.userPassword);
    await page.goto("/");

    await expect(
      page.locator('a[href="/tickets?view=inbox&inboxTab=unrouted"]'),
    ).toHaveCount(0);
    await expect(page.getByText(/SLA nadzor|SLA watch/i)).toHaveCount(0);
    await expect(page.getByText(/Grupni inbox|Group inbox/i)).toHaveCount(0);
  });

  test("dashboard remains within the mobile viewport", async ({ page }) => {
    const env = readE2EEnvironment();
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, env.agentEmail, env.agentPassword);
    await page.goto("/");

    await expect(page.locator("#main-content h1").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
