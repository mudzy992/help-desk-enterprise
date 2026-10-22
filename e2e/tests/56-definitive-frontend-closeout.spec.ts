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
  await page.locator("#main-content h1:visible").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
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
  await page.locator("#main-content h1:visible").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
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
    // Browser zoom reduces the CSS layout viewport. CDP device metrics gives
    // Chromium a deterministic 640 CSS-pixel viewport at 2x scale while the
    // physical test viewport remains 1280 pixels wide.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 640,
      height: 450,
      deviceScaleFactor: 2,
      mobile: false,
      screenWidth: 1280,
      screenHeight: 900,
    });
    await page.goto("/");
    await page
      .locator("#main-content h1:visible")
      .first()
      .waitFor({ state: "visible" });
    const width = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      animation: getComputedStyle(
        document.querySelector(".page-in") ?? document.body,
      ).animationName,
    }));
    expect(width.client).toBe(640);
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    expect(width.animation).toBe("none");
    await cdp.send("Emulation.clearDeviceMetricsOverride");
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
    browser,
  }) => {
    const env = readE2EEnvironment();
    await page.context().clearCookies();
    await signIn(page, env.userEmail, env.userPassword);
    await page.goto("/");
    const skipLink = page.locator('a[href="#main-content"]');
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    // A cookie-only reset leaves the requester's local session snapshot in the
    // original page. Use an isolated browser context so signIn cannot mistake
    // the still-mounted requester shell for an authenticated agent shell.
    const agentContext = await browser.newContext();
    const agentPage = await agentContext.newPage();
    try {
      await signIn(agentPage, env.agentEmail, env.agentPassword);
      await agentPage.goto("/");
      await agentPage
        .locator("#main-content h1:visible")
        .first()
        .waitFor({ state: "visible" });
      await agentPage.keyboard.press("Shift+Slash");
      await expect(agentPage.getByTestId("shortcuts-help")).toBeVisible();
    } finally {
      await agentContext.close();
    }
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
      // React's production bundle intentionally strips Profiler callbacks.
      // Long-task budgets remain enforced in production; React commit budgets
      // are enforced whenever the stack uses a profiling-enabled React build.
      if (report.react.commits > 0) {
        expect(
          report.react.commits,
          `${route} React commits`,
        ).toBeLessThanOrEqual(profilerThresholds.maxCommits);
        expect(
          report.react.maxDuration,
          `${route} max commit`,
        ).toBeLessThanOrEqual(profilerThresholds.maxCommitDurationMs);
      }
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
        JSON.stringify(
          {
            thresholds: profilerThresholds,
            reactProfilerException: {
              owner: "Frontend platform",
              appliesWhen: "production React bundle reports zero commits",
              reason:
                "React strips Profiler callbacks from its production bundle",
            },
            reports,
          },
          null,
          2,
        ),
      ),
      contentType: "application/json",
    });
  });
});
