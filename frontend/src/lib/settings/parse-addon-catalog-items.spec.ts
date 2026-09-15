import { describe, expect, it } from "vitest";
import { parseAddonCatalogItems } from "@/lib/settings/parse-addon-catalog-items";

describe("parseAddonCatalogItems", () => {
  it("keeps only items the API returned, without filling missing keys", () => {
    expect(
      parseAddonCatalogItems({
        addons: {
          smtpEnabled: true,
          items: [
            {
              key: "sla",
              enabled: true,
              defaultEnabled: true,
              canEnable: true,
            },
            {
              key: "",
              enabled: false,
              defaultEnabled: false,
              canEnable: true,
            },
          ],
        },
      }).map((item) => item.key),
    ).toEqual(["sla"]);
  });

  it("returns an empty list when the payload has no addon keys", () => {
    expect(parseAddonCatalogItems(null)).toEqual([]);
    expect(parseAddonCatalogItems({ addons: { items: "nope" } })).toEqual([]);
  });
});
