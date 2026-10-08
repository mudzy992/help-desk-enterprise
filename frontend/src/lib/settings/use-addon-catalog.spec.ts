import { afterEach, describe, expect, it, vi } from "vitest";
import { hasAddonCatalogShape } from "@/lib/settings/parse-addon-catalog-items";
import { loadInstallAddons } from "@/services/install-addons-api";
import { loadSettingsAddons } from "@/services/settings-api";

/**
 * Paket 5.3.4 (ispravka 2026-10-08): the settings tab loads the addon state from
 * the authenticated `/settings/addons` route. The public `/install/addons` route
 * answers with the catalogue defaults once the installation is completed (5.2
 * finding M1 #5) — which is exactly why a switch went back to "off" after a save
 * that the server had accepted.
 */
function stubAddonResponse(
  expectedFragment: string,
  enabled: Record<string, boolean>,
) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const target =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    expect(target).toContain(expectedFragment);
    return new Response(
      JSON.stringify({
        addons: {
          smtpEnabled: true,
          items: Object.entries(enabled).map(([key, value]) => ({
            key,
            enabled: value,
            defaultEnabled: key === "csat",
            canEnable: true,
          })),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("addon catalogue sources", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the stored addon state from /settings/addons", async () => {
    const fetchMock = stubAddonResponse("/settings/addons", { cmdb: true });
    const status = await loadSettingsAddons();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(status.addons.smtpEnabled).toBe(true);
    expect(status.addons.items).toEqual([
      { key: "cmdb", enabled: true, defaultEnabled: false, canEnable: true },
    ]);
  });

  it("keeps the public install route for the wizard", async () => {
    stubAddonResponse("/install/addons", { cmdb: false });
    const status = await loadInstallAddons();
    expect(status.addons.items[0]?.enabled).toBe(false);
  });
});

/**
 * The 2026-10-08 regression in one assertion: the backend once returned the
 * addon record unwrapped, the parser rejected it, and the card disappeared
 * without a word. The envelope check is what the card keys its error state on.
 */
describe("addon catalogue envelope", () => {
  it("accepts the envelope both routes use", () => {
    expect(
      hasAddonCatalogShape({
        addons: { smtpEnabled: false, items: [] },
      }),
    ).toBe(true);
  });

  it("rejects an unwrapped record — that is a failure, not an empty catalogue", () => {
    expect(
      hasAddonCatalogShape({
        smtpEnabled: false,
        items: [{ key: "cmdb", enabled: true, defaultEnabled: false, canEnable: true }],
      }),
    ).toBe(false);
    expect(hasAddonCatalogShape({ addons: { items: "nope" } })).toBe(false);
    expect(hasAddonCatalogShape(null)).toBe(false);
  });
});
