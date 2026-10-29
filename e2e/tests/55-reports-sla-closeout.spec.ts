import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "../helpers/a11y";
import { readE2EEnvironment } from "../helpers/environment";
import { signIn } from "../helpers/sign-in";

const widths = [320, 375, 768, 1280] as const;

test.describe("55 Reports/SLA browser closeout", () => {
  test.beforeEach(async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
  });

  test("Back/Forward restores the URL-backed Reports and SLA views", async ({
    page,
  }) => {
    await page.goto(
      "/reports?tab=trends&preset=custom&from=2026-10-01&to=2026-10-20",
    );
    await expect(page.getByTestId("trends-panel")).toBeVisible({
      timeout: 20_000,
    });

    await page.goto(
      "/reports?tab=packs&preset=custom&from=2026-10-01&to=2026-10-20",
    );
    await expect(page.getByTestId("report-packs")).toBeVisible({
      timeout: 20_000,
    });

    await page.goBack();
    await expect(page).toHaveURL(/tab=trends/);
    await expect(page.getByTestId("trends-panel")).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/tab=packs/);
    await expect(page.getByTestId("report-packs")).toBeVisible();

    await page.goto("/sla?panel=compliance");
    await expect(
      page.getByRole("heading", { name: /SLA compliance|SLA usklađenost/i }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await page.goto("/sla?view=matrix");
    await expect(
      page.getByRole("heading", {
        name: /Priority matrix|Matrica prioriteta/i,
      }),
    ).toBeVisible({
      timeout: 20_000,
    });

    await page.goBack();
    await expect(page).toHaveURL(/panel=compliance/);
    await expect(
      page.getByRole("heading", { name: /SLA compliance|SLA usklađenost/i }),
    ).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/view=matrix/);
  });

  test("main Reports/SLA surfaces fit target viewports and pass the axe gate", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const routes = [
      { path: "/reports", ready: page.getByTestId("overview-print") },
      { path: "/reports?tab=trends", ready: page.getByTestId("trends-panel") },
      { path: "/reports?tab=packs", ready: page.getByTestId("report-packs") },
      {
        path: "/sla",
        ready: page.getByRole("heading", { name: /SLA rules|SLA pravila/i }),
      },
      {
        path: "/sla?panel=compliance",
        ready: page.getByRole("heading", {
          name: /SLA compliance|SLA usklađenost/i,
        }),
      },
      {
        path: "/sla?view=matrix",
        ready: page.getByRole("heading", {
          name: /Priority matrix|Matrica prioriteta/i,
        }),
      },
    ] as const;

    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        await page.goto(route.path);
        await expect(route.ready).toBeVisible({ timeout: 20_000 });
        const scrollWidth = await page.evaluate(
          () => document.documentElement.scrollWidth,
        );
        expect(scrollWidth, `${route.path} at ${width}px`).toBeLessThanOrEqual(
          width + 1,
        );
      }
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/reports?tab=trends");
    await expect(page.getByTestId("trends-panel")).toBeVisible({
      timeout: 20_000,
    });
    await expectNoSeriousA11yViolations(
      page,
      "reports-trends-closeout",
      testInfo,
    );

    await page.goto("/sla?panel=compliance");
    await expect(
      page.getByRole("heading", { name: /SLA compliance|SLA usklađenost/i }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expectNoSeriousA11yViolations(
      page,
      "sla-compliance-closeout",
      testInfo,
    );
  });
});
