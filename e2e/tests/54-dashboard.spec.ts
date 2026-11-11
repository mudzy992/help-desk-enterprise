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
      .locator('a[href*="view=all"]:not([href*="priority=CRITICAL"])')
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

  test("dashboard reflows its cards and charts within mobile viewports", async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.agentEmail, env.agentPassword);

    for (const viewport of [
      { width: 320, height: 800, metricColumns: 1 },
      { width: 360, height: 800, metricColumns: 2 },
      { width: 390, height: 844, metricColumns: 2 },
      { width: 768, height: 1024, metricColumns: 2 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");

      await expect(page.locator("#main-content h1").first()).toBeVisible();
      const metricGrid = page.getByTestId("dashboard-metric-grid");
      const chartGrid = page.getByTestId("dashboard-chart-grid");
      await expect(metricGrid).toBeVisible();
      await expect(chartGrid).toBeVisible();

      const layout = await page.evaluate(() => {
        const metric = document.querySelector<HTMLElement>(
          '[data-testid="dashboard-metric-grid"]',
        );
        const charts = document.querySelector<HTMLElement>(
          '[data-testid="dashboard-chart-grid"]',
        );
        const main = document.querySelector<HTMLElement>("#main-content");
        if (metric === null || charts === null || main === null)
          throw new Error("Dashboard layout regions are missing");
        return {
          metricColumns:
            getComputedStyle(metric).gridTemplateColumns.split(" ").length,
          chartColumns:
            getComputedStyle(charts).gridTemplateColumns.split(" ").length,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          mainOverflow: main.scrollWidth - main.clientWidth,
        };
      });

      expect(layout.metricColumns).toBe(viewport.metricColumns);
      expect(layout.chartColumns).toBe(1);
      expect(layout.overflow).toBeLessThanOrEqual(1);
      expect(layout.mainOverflow).toBeLessThanOrEqual(1);
    }
  });
});
