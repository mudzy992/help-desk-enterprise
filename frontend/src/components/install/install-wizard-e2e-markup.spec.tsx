// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallSetupProvider } from "@/app/install-setup-provider";
import { InstallReadinessList } from "@/components/install/install-readiness-checks";
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
  skipInstallStep,
} from "@/services/install-profile-api";
import type { InstallStepKey, InstallStepState, InstallSetupStatus } from "@/services/install-api";

/*
  F6 — the **markup** the install-wizard E2E drives, beside
  `install-wizard-e2e-copy.spec.ts`, which pins the strings it reads.

  The wizard was redesigned visually („Aurora“, owner decision 2026-10-16) and a
  redesign may not move a single selector: specs 51/52/53 answer the wizard
  through its own screen. This spec states that contract where the frontend job
  can check it — the shell, the profile step and the token gate, rendered for
  real — so a redesign that breaks the harness fails here instead of in the
  browser run:

    · the step headline is the page's only `h1` (the reader waits on it) — the
      shell's own ordering rules are pinned in `shell/install-wizard-shell.spec.tsx`,
    · the package card matches `div.rounded-lg.border` (the locator helper),
    · the readiness rows are `ul[aria-live="polite"] li` (the provisioning step),
    · the token gate keeps `#install-token` inside its own `<form>`,
    · the finished screen keeps the `/login` link and adds no second heading.
*/

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/components/layout/locale-select", () => ({ LocaleSelect: () => <span /> }));

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

const stepKeys: readonly InstallStepKey[] = [
  "profile",
  "superAdmin",
  "identity",
  "loginProvider",
  "smtp",
  "seed",
  "team",
  "blueprint",
  "policyPack",
  "slaReview",
  "securityRecommendations",
  "addons",
  "provisioning",
];

function status(nextStep: InstallSetupStatus["nextStep"], isCompleted = false): InstallSetupStatus {
  const steps = Object.fromEntries(
    stepKeys.map((key) => [
      key,
      {
        completed: false,
        skipped: false,
        required: true,
        offered: true,
        skippable: false,
        blocking: false,
      } satisfies InstallStepState,
    ]),
  ) as Readonly<Record<InstallStepKey, InstallStepState>>;
  return { isCompleted, nextStep, profile: "minimum", steps };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InstallSetupProvider>
        <InstallPage />
      </InstallSetupProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  writeInstallToken("token-from-the-terminal");
  vi.mocked(loadInstallSetupStatus).mockResolvedValue(status("profile"));
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
  vi.mocked(loadInstallProfile).mockResolvedValue({
    profile: null,
    packages: [
      {
        profile: "minimum",
        titleKey: "install.profile.minimum.title",
        descriptionKey: "install.profile.minimum.description",
        estimatedMinutes: 5,
        recommended: false,
        requiredSteps: [],
        offeredSteps: [],
        defaultEnabledAddons: [],
        items: [],
      },
    ],
    reopenedSteps: [],
  });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.mocked(loadInstallSetupStatus).mockReset();
  vi.mocked(loadInstallProfile).mockReset();
});

describe("install wizard page markup", () => {
  it("keeps the package card findable as `div.rounded-lg.border` with the package title", async () => {
    const { container } = renderPage();
    await screen.findByRole("button", { name: "install.profile.select" });
    const card = container.querySelector("div.rounded-lg.border");
    expect(card?.textContent).toContain("install.profile.minimum.title");
  });

  it("keeps the readiness rows a `ul[aria-live=polite] li` list", () => {
    const { container } = render(
      <InstallReadinessList
        checks={[{ key: "roles", status: "missing", messageKey: "install.readiness.roles" }]}
        onFixStep={() => undefined}
      />,
    );
    const list = container.querySelector('ul[aria-live="polite"]');
    expect(list?.querySelectorAll("li").length).toBe(1);
  });

  it("keeps `#install-token` inside its own form with a submit button", async () => {
    window.sessionStorage.clear();
    renderPage();
    const field = await screen.findByLabelText("install.tokenLabel");
    expect(field.getAttribute("id")).toBe("install-token");
    const form = field.closest("form");
    expect(form?.querySelector('button[type="submit"]')?.textContent).toBe("install.tokenSubmit");
    // While the gate is closed it owns the screen — no wizard chrome behind it.
    expect(screen.getAllByRole("heading", { level: 1 })[0]?.textContent).toBe(
      "install.tokenHeading",
    );
  });

  it("hands the operator the `/login` link as a link, and adds no second heading", async () => {
    vi.mocked(loadInstallSetupStatus).mockResolvedValue(status("complete", true));
    renderPage();
    const link = await screen.findByRole("link", { name: "install.ready.signIn" });
    expect(link.getAttribute("href")).toBe("/login");
    await waitFor(() =>
      expect(screen.getAllByRole("heading", { level: 1 })[0]?.textContent).toBe(
        "install.complete.heading",
      ),
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
