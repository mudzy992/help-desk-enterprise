import { describe, expect, it } from "vitest";
import {
  buildInstallLoginProviderInput,
  isInstallLoginProviderFormReady,
} from "@/lib/build-install-login-provider-input";

const emptyEntra = {
  azureTenantId: "",
  azureClientId: "",
  adLdapsUrlsCsv: "",
  adBindDn: "",
  adBindPassword: "",
  entraAlreadyConfigured: false,
  directoryBindAlreadyConfigured: false,
};

describe("buildInstallLoginProviderInput", () => {
  it("accepts local without AD or Entra fields", () => {
    const values = { mode: "local" as const, ...emptyEntra };
    expect(isInstallLoginProviderFormReady(values)).toBe(true);
    expect(buildInstallLoginProviderInput(values)).toEqual({ mode: "local" });
  });

  it("requires Entra tenant and client or a complete LDAPS bind", () => {
    expect(
      isInstallLoginProviderFormReady({ mode: "entra_ad", ...emptyEntra }),
    ).toBe(false);
    expect(
      isInstallLoginProviderFormReady({
        mode: "entra_ad",
        ...emptyEntra,
        azureTenantId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(false);
    expect(
      isInstallLoginProviderFormReady({
        mode: "entra_ad",
        ...emptyEntra,
        azureTenantId: "11111111-1111-4111-8111-111111111111",
        azureClientId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(true);
    expect(
      isInstallLoginProviderFormReady({
        mode: "entra_ad",
        ...emptyEntra,
        adLdapsUrlsCsv: "ldaps://dc1.epbih.ba:636",
        adBindDn: "CN=svc,DC=epbih,DC=ba",
        adBindPassword: "secret",
      }),
    ).toBe(true);
  });

  it("omits empty secret fields from the entra_ad payload", () => {
    expect(
      buildInstallLoginProviderInput({
        mode: "entra_ad",
        ...emptyEntra,
        azureTenantId: " 11111111-1111-4111-8111-111111111111 ",
        azureClientId: "22222222-2222-4222-8222-222222222222",
        entraAlreadyConfigured: true,
      }),
    ).toEqual({
      mode: "entra_ad",
      azureTenantId: "11111111-1111-4111-8111-111111111111",
      azureClientId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
