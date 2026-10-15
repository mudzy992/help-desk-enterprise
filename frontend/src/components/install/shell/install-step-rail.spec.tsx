// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InstallStepRail,
  resolveInstallRailState,
  type InstallRailItem,
} from "@/components/install/shell/install-step-rail";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/*
  F3: the rail is the wizard's map. Every state it can show comes from the status
  endpoint (`InstallStepState`), so these tests pin both the derivation and the
  rendering — „završeno“, „trenutno“, „odgođeno“, „zaključano“ (the package does
  not offer the step) and „tek slijedi“.
*/

const items: readonly InstallRailItem[] = [
  { key: "profile", state: "done" },
  { key: "superAdmin", state: "current" },
  { key: "identity", state: "deferred" },
  { key: "smtp", state: "locked" },
  { key: "seed", state: "upcoming" },
];

afterEach(cleanup);

describe("resolveInstallRailState", () => {
  it("reads the states in the order the wizard needs them", () => {
    // A step the package does not offer is locked even if it was completed by an
    // earlier package choice — the rail never shows a step this run cannot walk.
    expect(
      resolveInstallRailState({
        isActive: true,
        isCompleted: true,
        isDeferred: true,
        isOffered: false,
      }),
    ).toBe("locked");
    expect(
      resolveInstallRailState({
        isActive: true,
        isCompleted: true,
        isDeferred: true,
        isOffered: true,
      }),
    ).toBe("current");
    expect(
      resolveInstallRailState({
        isActive: false,
        isCompleted: true,
        isDeferred: true,
        isOffered: true,
      }),
    ).toBe("done");
    expect(
      resolveInstallRailState({
        isActive: false,
        isCompleted: false,
        isDeferred: true,
        isOffered: true,
      }),
    ).toBe("deferred");
    expect(
      resolveInstallRailState({
        isActive: false,
        isCompleted: false,
        isDeferred: false,
        isOffered: true,
      }),
    ).toBe("upcoming");
  });
});

describe("InstallStepRail", () => {
  it("lists every step with its own label", () => {
    render(<InstallStepRail items={items} />);

    expect(screen.getAllByRole("listitem").map((entry) => entry.textContent)).toEqual([
      "install.steps.profile",
      "install.steps.superAdmin",
      "install.steps.identityinstall.step.skipped",
      "install.steps.smtp",
      "install.steps.seed",
    ]);
  });

  it("marks the deferred step as deferred instead of counting it as done", () => {
    render(<InstallStepRail items={items} />);

    const deferred = screen.getByText("install.steps.identity");
    expect(deferred.parentElement?.textContent).toContain("install.step.skipped");
    expect(screen.queryByText("install.steps.smtp")?.className).toContain("muted");
  });
});
