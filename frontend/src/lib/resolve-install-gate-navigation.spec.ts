import { describe, expect, it } from "vitest";
import { resolveInstallGateNavigation } from "@/lib/resolve-install-gate-navigation";

describe("resolveInstallGateNavigation", () => {
  it("sends application routes to /install while setup is incomplete", () => {
    expect(
      resolveInstallGateNavigation({
        pathname: "/",
        isSetupComplete: false,
      }),
    ).toBe("/install");
    expect(
      resolveInstallGateNavigation({
        pathname: "/tickets",
        isSetupComplete: false,
      }),
    ).toBe("/install");
  });

  it("allows /install while setup is incomplete", () => {
    expect(
      resolveInstallGateNavigation({
        pathname: "/install",
        isSetupComplete: false,
      }),
    ).toBeNull();
  });

  it("disables the gate after setup is completed", () => {
    expect(
      resolveInstallGateNavigation({
        pathname: "/tickets",
        isSetupComplete: true,
      }),
    ).toBeNull();
    expect(
      resolveInstallGateNavigation({
        pathname: "/",
        isSetupComplete: true,
      }),
    ).toBeNull();
  });

  it("sends /install to the application after setup is completed", () => {
    expect(
      resolveInstallGateNavigation({
        pathname: "/install",
        isSetupComplete: true,
      }),
    ).toBe("/");
    expect(
      resolveInstallGateNavigation({
        pathname: "/install/status",
        isSetupComplete: true,
      }),
    ).toBe("/");
  });

  it("does not block /install with its own gate", () => {
    expect(
      resolveInstallGateNavigation({
        pathname: "/install",
        isSetupComplete: false,
      }),
    ).toBeNull();
    expect(
      resolveInstallGateNavigation({
        pathname: "/install/status",
        isSetupComplete: false,
      }),
    ).toBeNull();
  });
});
