import { expect, test } from "@playwright/test";
import { readE2EEnvironment } from "../helpers/environment";
import { signIn } from "../helpers/sign-in";

const targetWidths = [360, 390] as const;

test.describe("54 responsive application shell", () => {
  for (const width of targetWidths) {
    test(`header fits and keeps its controls operable at ${width}px`, async ({
      page,
    }, testInfo) => {
      const env = readE2EEnvironment();
      await page.setViewportSize({ width, height: 800 });
      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      await page.goto("/");

      const header = page.locator("header").first();
      await expect(header).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Otvori navigaciju|Open navigation/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: /Otvori komandnu paletu|Open command palette/,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: /Promijeni izgled|Change appearance/,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Obavještenja|Notifications/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Meni naloga|Account menu/ }),
      ).toBeVisible();

      const metrics = await page.evaluate(() => {
        const element = document.querySelector("header");
        if (!(element instanceof HTMLElement))
          throw new Error("Application header was not found");
        const headerBox = element.getBoundingClientRect();
        const visibleControls = [...element.querySelectorAll("button")]
          .filter((control) => {
            const style = window.getComputedStyle(control);
            const box = control.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              box.width > 0
            );
          })
          .map((control) => {
            const box = control.getBoundingClientRect();
            return {
              label:
                control.getAttribute("aria-label") ?? control.textContent ?? "",
              left: box.left,
              right: box.right,
            };
          });
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          headerLeft: headerBox.left,
          headerRight: headerBox.right,
          visibleControls,
        };
      });

      expect(metrics.documentWidth).toBeLessThanOrEqual(
        metrics.viewportWidth + 1,
      );
      expect(metrics.headerLeft).toBeGreaterThanOrEqual(-1);
      expect(metrics.headerRight).toBeLessThanOrEqual(
        metrics.viewportWidth + 1,
      );
      for (const control of metrics.visibleControls) {
        expect(
          control.left,
          `${control.label} left edge`,
        ).toBeGreaterThanOrEqual(-1);
        expect(
          control.right,
          `${control.label} right edge`,
        ).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      }

      await testInfo.attach(`shell-header-${width}`, {
        body: await header.screenshot(),
        contentType: "image/png",
      });
    });
  }
});
