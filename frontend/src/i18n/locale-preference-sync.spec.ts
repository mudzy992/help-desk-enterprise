import { describe, expect, it } from "vitest";
import { decideLocaleSync } from "@/i18n/locale-preference-sync";

describe("decideLocaleSync", () => {
  it("saves the current language when the user never chose one", () => {
    expect(decideLocaleSync({ serverLocale: null, currentLocale: "en" })).toEqual({
      action: "push",
      locale: "en",
    });
    expect(decideLocaleSync({ serverLocale: "de", currentLocale: "bs" })).toEqual({
      action: "push",
      locale: "bs",
    });
  });

  it("applies the saved language on a new device", () => {
    expect(decideLocaleSync({ serverLocale: "en", currentLocale: "bs" })).toEqual({
      action: "apply",
      locale: "en",
    });
  });

  it("does nothing when both agree", () => {
    expect(decideLocaleSync({ serverLocale: "bs", currentLocale: "bs" })).toEqual({
      action: "none",
    });
  });
});
