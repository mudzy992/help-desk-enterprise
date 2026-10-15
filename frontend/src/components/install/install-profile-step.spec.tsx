// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallProfileStep } from "@/components/install/install-profile-step";
import { ApiError } from "@/services/api";
import { loadInstallProfile, saveInstallProfile } from "@/services/install-profile-api";
import type { InstallProfilePackage } from "@/services/install-profile-api";
import type { InstallStepKey, InstallStepState } from "@/services/install-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/install-profile-api", () => ({
  loadInstallProfile: vi.fn(),
  saveInstallProfile: vi.fn(),
}));

/*
  F3: the package picker. It decides the wizard's shape, so the spec covers the
  three promises the plan makes — the cards compare real catalogue data, „Prilagodi“
  only offers a switch for a step the registry allows to be deferred, and saving
  the choice is what moves the wizard on.
*/

function pack(
  profile: "minimum" | "standard" | "full",
  items: readonly { key: string; required: boolean }[],
): InstallProfilePackage {
  return {
    profile,
    titleKey: `install.profile.${profile}.title`,
    descriptionKey: `install.profile.${profile}.description`,
    estimatedMinutes: profile === "minimum" ? 5 : 15,
    recommended: profile === "standard",
    requiredSteps: [],
    offeredSteps: [],
    defaultEnabledAddons: [],
    items: items.map((item) => ({ ...item, labelKey: `install.profile.item.${item.key}` })),
  };
}

const packages = [
  pack("minimum", [
    { key: "tokenGate", required: true },
    { key: "superAdmin", required: true },
  ]),
  pack("standard", [
    { key: "team", required: true },
    { key: "smtp", required: true },
  ]),
  pack("full", [{ key: "knowledgeBase", required: false }]),
];

function steps(
  overrides: Partial<Record<InstallStepKey, InstallStepState>> = {},
): Readonly<Record<InstallStepKey, InstallStepState>> {
  const keys: readonly InstallStepKey[] = [
    "profile",
    "superAdmin",
    "identity",
    "loginProvider",
    "smtp",
    "seed",
    "team",
    "addons",
  ];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      {
        completed: false,
        skipped: false,
        offered: true,
        required: true,
        skippable: false,
        blocking: false,
        ...overrides[key],
      },
    ]),
  ) as Readonly<Record<InstallStepKey, InstallStepState>>;
}

function renderStep(
  overrides: Partial<Record<InstallStepKey, InstallStepState>> = {},
  onDeferStep = vi.fn(),
) {
  render(
    <InstallProfileStep
      states={steps(overrides)}
      onSaved={vi.fn()}
      onDeferStep={onDeferStep}
      isDeferPending={false}
    />,
  );
  return { onDeferStep };
}

beforeEach(() => {
  vi.mocked(loadInstallProfile).mockResolvedValue({ profile: null, packages, reopenedSteps: [] });
  vi.mocked(saveInstallProfile).mockResolvedValue({
    profile: "standard",
    packages,
    reopenedSteps: [],
  });
});

afterEach(() => {
  cleanup();
  vi.mocked(loadInstallProfile).mockReset();
  vi.mocked(saveInstallProfile).mockReset();
});

describe("InstallProfileStep", () => {
  it("compares the packages with their estimate and recommended marker", async () => {
    renderStep();

    expect(await screen.findByText("install.profile.minimum.title")).toBeTruthy();
    expect(screen.getByText("install.profile.recommended")).toBeTruthy();
    expect(screen.getAllByText(/install\.profile\.estimate/)).toHaveLength(3);
  });

  it("saves the chosen package and tells the wizard to move on", async () => {
    const onSaved = vi.fn();
    render(
      <InstallProfileStep
        states={steps()}
        onSaved={onSaved}
        onDeferStep={vi.fn()}
        isDeferPending={false}
      />,
    );

    fireEvent.click((await screen.findAllByRole("button", { name: "install.profile.select" }))[0]);
    fireEvent.click(screen.getByRole("button", { name: "install.profile.submit" }));

    await waitFor(() => expect(saveInstallProfile).toHaveBeenCalledWith("minimum"));
    expect(onSaved).toHaveBeenCalled();
  });

  it("defers a step through the registry flag and locks the steps it does not allow", async () => {
    const { onDeferStep } = renderStep({
      // Standard is the chosen package here, and the team step may be deferred.
      team: { completed: false, blocking: true, skippable: true },
    });

    fireEvent.click((await screen.findAllByRole("button", { name: "install.profile.select" }))[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "install.profile.select" })[1]);

    // `team` is deferrable: its switch is a real control.
    const teamSwitch = screen.getByRole("switch", { name: "install.profile.item.team" });
    fireEvent.click(teamSwitch);
    expect(onDeferStep).toHaveBeenCalledWith("team", true);

    // `superAdmin` is required and not deferrable: the card says so instead.
    expect(screen.queryByRole("switch", { name: "install.profile.item.superAdmin" })).toBeNull();
    expect(screen.getAllByText("install.profile.lockedHint").length).toBeGreaterThan(0);
  });

  it("reports a locked package with the server's message", async () => {
    vi.mocked(saveInstallProfile).mockRejectedValue(
      new ApiError(409, "INSTALL_PROFILE_LOCKED_AFTER_SEED", "locked"),
    );
    renderStep();

    fireEvent.click((await screen.findAllByRole("button", { name: "install.profile.select" }))[0]);
    fireEvent.click(screen.getByRole("button", { name: "install.profile.submit" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("install.profile.errorLocked");
  });
});
