import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "../helpers/a11y";
import { readE2EEnvironment } from "../helpers/environment";
import { signIn } from "../helpers/sign-in";

const viewportWidths = [320, 360, 390, 768, 1280, 1920] as const;
const representativeRoutes = [
  "/",
  "/tickets?view=all",
  "/reports",
  "/assets",
  "/services",
  "/on-call",
  "/privacy",
] as const;

const profilerThresholds = {
  maxCommits: 80,
  maxCommitDurationMs: 120,
  maxLongTasks: 3,
  maxLongTaskDurationMs: 250,
} as const;

type ProfileReport = {
  readonly commits: number;
  readonly totalDuration: number;
  readonly maxDuration: number;
};

async function expectPageFits(
  page: Page,
  route: string,
  width: number,
): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page
    .locator("#main-content h1")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document, `${route} at ${width}px`).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
}

async function profileRoute(
  page: Page,
  route: string,
): Promise<{
  readonly react: ProfileReport;
  readonly longTasks: readonly number[];
}> {
  await page.addInitScript(() => {
    const durations: number[] = [];
    window.__EPHD_LONG_TASKS__ = durations;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) durations.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
  });
  const separator = route.includes("?") ? "&" : "?";
  await page.goto(`${route}${separator}profile=1`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator("#main-content h1")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(1_000);
  return page.evaluate(() => ({
    react: window.__EPHD_PROFILE__ ?? {
      commits: 0,
      totalDuration: 0,
      maxDuration: 0,
    },
    longTasks: window.__EPHD_LONG_TASKS__ ?? [],
  }));
}

declare global {
  interface Window {
    __EPHD_LONG_TASKS__?: number[];
    __EPHD_PROFILE__?: ProfileReport;
  }
}

test.describe("56 definitive frontend responsive, a11y and profiler closeout", () => {
  test.beforeEach(async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
  });

  test("representative routes have no page overflow across the required viewport matrix", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    for (const width of viewportWidths) {
      await page.setViewportSize({ width, height: 1_000 });
      for (const route of representativeRoutes)
        await expectPageFits(page, route, width);
    }
  });

  test("200 percent zoom, reduced motion, focus return and serious axe gate remain valid", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await page.goto("/");
    await page
      .locator("#main-content h1")
      .first()
      .waitFor({ state: "visible" });
    const width = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      animation: getComputedStyle(
        document.querySelector(".page-in") ?? document.body,
      ).animationName,
      scale: window.visualViewport?.scale ?? 1,
    }));
    expect(width.scale).toBe(2);
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    expect(width.animation).toBe("none");
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    const trigger = page.getByRole("button", {
      name: /Open command palette|Otvori komandnu paletu/i,
    });
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expectNoSeriousA11yViolations(
      page,
      "definitive-dashboard-dark",
      testInfo,
    );
  });

  test("requester and agent keyboard surfaces remain operable", async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    await page.context().clearCookies();
    await signIn(page, env.userEmail, env.userPassword);
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute(
      "href",
      "#main-content",
    );

    await page.context().clearCookies();
    await signIn(page, env.agentEmail, env.agentPassword);
    await page.goto("/");
    await page.keyboard.press("Shift+Slash");
    await expect(page.getByTestId("shortcuts-help")).toBeVisible();
  });

  test("React commits and browser long tasks stay within predeclared thresholds", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const routes = ["/", "/tickets?view=all", "/assets", "/services"] as const;
    const reports: Record<
      string,
      Awaited<ReturnType<typeof profileRoute>>
    > = {};
    for (const route of routes) {
      const report = await profileRoute(page, route);
      reports[route] = report;
      expect(report.react.commits, `${route} React commits`).toBeGreaterThan(0);
      expect(
        report.react.commits,
        `${route} React commits`,
      ).toBeLessThanOrEqual(profilerThresholds.maxCommits);
      expect(
        report.react.maxDuration,
        `${route} max commit`,
      ).toBeLessThanOrEqual(profilerThresholds.maxCommitDurationMs);
      expect(
        report.longTasks.length,
        `${route} long tasks`,
      ).toBeLessThanOrEqual(profilerThresholds.maxLongTasks);
      expect(
        report.longTasks.reduce((sum, value) => sum + value, 0),
        `${route} long-task duration`,
      ).toBeLessThanOrEqual(profilerThresholds.maxLongTaskDurationMs);
    }
    await testInfo.attach("frontend-profiler-results", {
      body: Buffer.from(
        JSON.stringify({ thresholds: profilerThresholds, reports }, null, 2),
      ),
      contentType: "application/json",
    });
  });
});
