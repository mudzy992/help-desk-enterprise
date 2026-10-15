import { describe, expect, it } from "vitest";
import {
  buildSaveInstallIdentityInput,
  isInstallIdentityFormReady,
  toInstallIdentityFormValues,
  toInstallIdentityPreview,
} from "@/lib/install/install-identity-form";
import { isInstallTimeZoneSupported } from "@/lib/install/install-time-zones";

const stored = {
  organizationName: "Gradska uprava Visoko",
  appName: "Portala",
  tagline: "",
  locale: "bs" as const,
  timeZone: "Europe/Sarajevo",
  logoConfigured: true,
  supportEmail: "",
  supportUrl: "",
  isConfigured: true,
};

/**
 * F2: an empty optional field means "Podesi kasnije", so it must not travel —
 * posting it would overwrite a value an earlier save already stored.
 */
describe("install identity form", () => {
  it("never sends the fields the operator deferred", () => {
    const values = toInstallIdentityFormValues({
      ...stored,
      appName: "",
      timeZone: "Europe/Sarajevo",
    });

    expect(buildSaveInstallIdentityInput(values)).toEqual({
      organizationName: "Gradska uprava Visoko",
      appName: "",
      locale: "bs",
      timeZone: "Europe/Sarajevo",
    });
    // The logo stays server-side: the wizard only knows that one is configured.
    expect(buildSaveInstallIdentityInput(values)).not.toHaveProperty("logoDataUrl");
  });

  it("sends the logo and the contacts once they are filled", () => {
    const values = toInstallIdentityFormValues(stored);
    const input = buildSaveInstallIdentityInput({
      ...values,
      logoDataUrl: "data:image/png;base64,AAAA",
      supportEmail: "podrska@example.com",
      supportUrl: "https://podrska.example.com",
    });

    expect(input).toMatchObject({
      logoDataUrl: "data:image/png;base64,AAAA",
      supportEmail: "podrska@example.com",
      supportUrl: "https://podrska.example.com",
    });
  });

  it("requires the organisation name and a known time zone", () => {
    const values = toInstallIdentityFormValues(stored);
    expect(isInstallIdentityFormReady(values)).toBe(true);
    expect(isInstallIdentityFormReady({ ...values, organizationName: "  " })).toBe(false);
    expect(isInstallIdentityFormReady({ ...values, timeZone: "Mars/Olympus" })).toBe(false);
    expect(isInstallIdentityFormReady({ ...values, timeZone: "Europe/Sarajevo" })).toBe(true);
  });

  it("shows the brand panel from the typed values", () => {
    const values = toInstallIdentityFormValues(stored);
    expect(toInstallIdentityPreview({ ...values, appName: "", organizationName: "" })).toEqual({
      appName: "Service Desk",
      organizationName: "",
      logoDataUrl: "",
      hasLogo: true,
    });
  });

  it("accepts the IANA aliases the runtime knows", () => {
    expect(isInstallTimeZoneSupported("UTC")).toBe(true);
    expect(isInstallTimeZoneSupported("Europe/Sarajevo")).toBe(true);
    expect(isInstallTimeZoneSupported("")).toBe(false);
    expect(isInstallTimeZoneSupported("Not/AZone")).toBe(false);
  });
});
