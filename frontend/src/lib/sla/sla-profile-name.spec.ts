import { describe, expect, it, vi } from "vitest";
import bsLocale from "@/i18n/locales/bs/common.json";
import enLocale from "@/i18n/locales/en/common.json";
import { formatSlaProfileName, slaProfileNameTranslationKey } from "@/lib/sla/sla-profile-name";

describe("SLA profile names", () => {
  it.each([
    ["ACCESS", "Access", "sla.profileNames.ACCESS"],
    ["STANDARD_REQUEST", "Standard request", "sla.profileNames.STANDARD_REQUEST"],
    ["HR", "HR", "sla.profileNames.HR"],
    ["FINANCE", "Finance", "sla.profileNames.FINANCE"],
    ["INCIDENT", "Incident", "sla.profileNames.INCIDENT"],
  ])("maps the built-in %s profile label", (profileKey, profileName, translationKey) => {
    expect(slaProfileNameTranslationKey(profileKey, profileName)).toBe(translationKey);
  });

  it("provides fully localized built-in profile names", () => {
    expect(bsLocale.sla.profileNames).toEqual({
      ACCESS: "Pristup",
      STANDARD_REQUEST: "Standardni zahtjev",
      HR: "Ljudski resursi",
      FINANCE: "Finansije",
      INCIDENT: "Prijava incidenta",
    });
    expect(enLocale.sla.profileNames).toEqual({
      ACCESS: "Access",
      STANDARD_REQUEST: "Standard request",
      HR: "Human resources",
      FINANCE: "Finance",
      INCIDENT: "Incident",
    });
  });

  it("uses the localized label for a built-in profile", () => {
    const translate = vi.fn((key: string) => key === "sla.profileNames.ACCESS" ? "Pristup" : key);

    expect(formatSlaProfileName("ACCESS", "Access", translate)).toBe("Pristup");
    expect(translate).toHaveBeenCalledWith("sla.profileNames.ACCESS", { defaultValue: "Access" });
  });

  it("preserves customized and unknown profile names", () => {
    const translate = vi.fn((key: string) => key);

    expect(formatSlaProfileName("ACCESS", "Privileged Access", translate)).toBe("Privileged Access");
    expect(formatSlaProfileName("CUSTOM", "Custom workflow", translate)).toBe("Custom workflow");
    expect(translate).not.toHaveBeenCalled();
  });
});
