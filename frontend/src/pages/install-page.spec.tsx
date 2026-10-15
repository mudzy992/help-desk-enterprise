// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallSetupProvider } from "@/app/install-setup-provider";
import { InstallPage } from "@/pages/install-page";
import { writeInstallToken } from "@/lib/install/install-token-store";
import {
  loadInstallPasswordPolicy,
  loadInstallSetupStatus,
  loadInstallSuperAdmin,
} from "@/services/install-api";
import {
  loadInstallProfile,
  loadInstallReadiness,
  saveInstallProfile,
  skipInstallStep,
} from "@/services/install-profile-api";
import type { InstallProfilePackage } from "@/services/install-profile-api";
import type { InstallStepKey, InstallStepState, InstallSetupStatus } from "@/services/install-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/install-api", () => ({
  loadInstallSuperAdmin: vi.fn(),
  loadInstallPasswordPolicy: vi.fn(),
  loadInstallSetupStatus: vi.fn(),
}));

vi.mock("@/services/install-profile-api", () => ({
  loadInstallReadiness: vi.fn(),
  loadInstallProfile: vi.fn(),
  saveInstallProfile: vi.fn(),
  loadInstallStepReadiness: vi.fn(),
  skipInstallStep: vi.fn(),
  unskipInstallStep: vi.fn(),
}));

vi.mock("@/components/layout/locale-select", () => ({
  LocaleSelect: () => <span />,
}));

/*
  F3: the page is the composition of the shell and the step the server reports.
  This spec drives the whole flow with the API mocked, so it pins the parts the
  shell owns: the rail and counter follow the status, „Nazad“ reopens an answered
  step without moving the wizard, and „Podesi kasnije“ only exists for a step the
  registry marked `skippable`.
*/

const stepKeys: readonly InstallStepKey[] = [
  "profile",
  "superAdmin",
  "identity",
  "loginProvider",
  "smtp",
  "seed",
  "team",
  "addons",
];

function states(
  completed: readonly InstallStepKey[],
  overrides: Partial<Record<InstallStepKey, InstallStepState>> = {},
): Readonly<Record<InstallStepKey, InstallStepState>> {
  return Object.fromEntries(
    stepKeys.map((key) => [
      key,
      {
        completed: completed.includes(key),
        skipped: false,
        required: true,
        offered: true,
        skippable: false,
        blocking: false,
        ...overrides[key],
      },
    ]),
  ) as Readonly<Record<InstallStepKey, InstallStepState>>;
}

function status(
  nextStep: InstallSetupStatus["nextStep"],
  completed: readonly InstallStepKey[],
  overrides: Partial<Record<InstallStepKey, InstallStepState>> = {},
): InstallSetupStatus {
  return { isCompleted: false, nextStep, profile: "minimum", steps: states(completed, overrides) };
}

beforeEach(() => {
  writeInstallToken("token-from-the-terminal");
  vi.mocked(loadInstallSuperAdmin).mockResolvedValue({
    superAdmin: {
      userId: "super-1",
      email: "founder@example.com",
      displayName: "Founder",
      isLocalOnly: true,
    },
  });
  vi.mocked(loadInstallPasswordPolicy).mockResolvedValue({
    minLength: 12,
    maxLength: 72,
    blocklistEnabled: false,
  });
  vi.mocked(loadInstallReadiness).mockResolvedValue({ isReady: false, checks: [] });
  vi.mocked(skipInstallStep).mockResolvedValue({ stepKey: "smtp", skipped: true });
  // The package picker is the first step, so it is the loader the first render hits.
  vi.mocked(loadInstallProfile).mockResolvedValue({
    profile: null,
    packages: [],
    reopenedSteps: [],
  });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.mocked(loadInstallSetupStatus).mockReset();
  vi.mocked(loadInstallSuperAdmin).mockReset();
  vi.mocked(skipInstallStep).mockReset();
  vi.mocked(loadInstallProfile).mockReset();
  vi.mocked(saveInstallProfile).mockReset();
});

const standardPackage: InstallProfilePackage = {
  profile: "standard",
  titleKey: "install.profile.standard.title",
  descriptionKey: "install.profile.standard.description",
  estimatedMinutes: 15,
  recommended: true,
  requiredSteps: ["smtp", "team"],
  offeredSteps: ["smtp", "team", "addons"],
  defaultEnabledAddons: [],
  items: [{ key: "smtp", labelKey: "install.profile.item.smtp", required: true }],
};

async function renderPage() {
  render(
    <InstallSetupProvider>
      <InstallPage />
    </InstallSetupProvider>,
  );
  // The gate unlocks only after the token was verified against the API.
  await screen.findByText("install.steps.profile");
}

describe("InstallPage (F3 shell)", () => {
  it("renders the step the server asks for, inside the shell", async () => {
    vi.mocked(loadInstallSetupStatus).mockResolvedValue(
      status("profile", [], { profile: { completed: false, blocking: true } }),
    );

    await renderPage();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("install.profile.heading");
    // The counter lives in the mobile header and above the step; both say 1 of 9.
    expect(screen.getAllByText(/install\.shell\.stepOf/).length).toBeGreaterThan(0);
    expect(screen.getByText("install.profile.submit")).toBeTruthy();
    // No step before the package, so there is nothing to review.
    expect(screen.queryByRole("button", { name: "install.shell.back" })).toBeNull();
  });

  it("shows „Podesi kasnije“ only for a skippable step and reloads the status after it", async () => {
    vi.mocked(loadInstallSetupStatus).mockResolvedValue(
      status("smtp", ["profile", "superAdmin", "identity", "loginProvider"], {
        smtp: { completed: false, blocking: true, skippable: true },
      }),
    );

    await renderPage();
    const later = screen.getByRole("button", { name: "install.shell.later" });
    expect(loadInstallSetupStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(later);

    await waitFor(() => expect(skipInstallStep).toHaveBeenCalledWith("smtp"));
    await waitFor(() => expect(loadInstallSetupStatus).toHaveBeenCalledTimes(2));
  });

  it("offers no deferral for a step that must be configured now", async () => {
    vi.mocked(loadInstallSetupStatus).mockResolvedValue(
      status("identity", ["profile", "superAdmin"], {
        identity: { completed: false, blocking: true },
      }),
    );

    await renderPage();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("install.identity.heading");
    expect(screen.queryByRole("button", { name: "install.shell.later" })).toBeNull();
    expect(screen.getByRole("button", { name: "install.shell.back" })).toBeTruthy();
  });

  it("explains a step the new package reopened instead of carrying the deferral over", async () => {
    vi.mocked(loadInstallSetupStatus)
      .mockResolvedValueOnce(
        status("profile", [], { profile: { completed: false, blocking: true } }),
      )
      // The upgrade to Standard puts SMTP back in the way (IN19).
      .mockResolvedValueOnce(
        status("smtp", ["profile", "superAdmin", "identity", "loginProvider"], {
          smtp: { completed: false, blocking: true, skippable: true },
        }),
      )
      // Deferring it again under Standard hides the notice.
      .mockResolvedValueOnce(
        status("addons", ["profile", "superAdmin", "identity", "loginProvider"], {
          smtp: { completed: false, skipped: true, blocking: false, skippable: true },
          addons: { completed: false, blocking: true, skippable: true },
        }),
      );
    vi.mocked(loadInstallProfile).mockResolvedValue({
      profile: "minimum",
      packages: [standardPackage],
      reopenedSteps: [],
    });
    vi.mocked(saveInstallProfile).mockResolvedValue({
      profile: "standard",
      packages: [standardPackage],
      reopenedSteps: ["smtp"],
    });

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "install.profile.select" }));
    fireEvent.click(screen.getByRole("button", { name: "install.profile.submit" }));

    expect(await screen.findByText("install.shell.reopened")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("install.smtp.heading");

    fireEvent.click(screen.getByRole("button", { name: "install.shell.later" }));

    await waitFor(() => expect(screen.queryByText("install.shell.reopened")).toBeNull());
  });

  it("„Nazad“ reopens an answered step and „Nastavi“ returns to the server's step", async () => {
    vi.mocked(loadInstallSetupStatus).mockResolvedValue(
      status("identity", ["profile", "superAdmin"], {
        identity: { completed: false, blocking: true },
      }),
    );

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "install.shell.back" }));

    // The founder step is answered, so it can be reviewed …
    expect(await screen.findByText("install.createdHeading")).toBeTruthy();
    expect(screen.getByRole("button", { name: "install.shell.continue" })).toBeTruthy();
    // … and the wizard itself did not move: no extra status read, no save.
    expect(loadInstallSetupStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "install.shell.continue" }));
    expect(await screen.findByText("install.identity.heading")).toBeTruthy();
  });
});
