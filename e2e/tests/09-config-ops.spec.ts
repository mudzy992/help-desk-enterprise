import { expect, test } from "@playwright/test";
import { ApiClient } from "../helpers/api-client";
import { readE2EEnvironment } from "../helpers/environment";
import { signIn } from "../helpers/sign-in";

test.describe("09 config ops", () => {
  test("validate → shadow → activate → rollback", async ({ page }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const created = await api.requestJson<{ id: string }>("/config-versions", {
      method: "POST",
      body: JSON.stringify({ releaseNotes: `E2E config ${Date.now()}` }),
    });
    await api.requestJson(`/config-versions/${created.id}/validate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await api.requestJson(`/config-versions/${created.id}/shadow`, {
      method: "POST",
    });
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto("/admin/config-versions");
    await page
      .getByText(/E2E config/)
      .first()
      .click();
    await page
      .getByLabel(/Activation reason|Razlog aktivacije/i)
      .fill("E2E activate through UI");
    await page.getByRole("button", { name: /Activate|Aktiviraj/i }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole("button", { name: /Activate|Aktiviraj/i })
      .click();
    await expect(confirmation).toBeHidden();

    const rolled = await api.requestJson<{ id: string }>(
      `/config-versions/${created.id}/rollback`,
      {
        method: "POST",
        body: JSON.stringify({ reason: "E2E rollback" }),
      },
    );
    expect(rolled.id.length).toBeGreaterThan(0);
  });
});
