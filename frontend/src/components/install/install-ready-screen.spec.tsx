// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallReadyScreen } from "@/components/install/install-ready-screen";
import type { InstallSetupSummary } from "@/services/install-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

const setupState: { status: string; summary: InstallSetupSummary | null } = {
  status: "ready",
  summary: null,
};
vi.mock("@/app/install-setup-provider", () => ({
  useInstallSetup: () => setupState,
}));

/*
  F6.2: „Sistem je spreman“ is what the operator sees after the finish. It reports
  what the wizard built and what happens next — and it is honest about the one
  thing it cannot do: the wizard never signs anybody in (owner decision 1), so the
  only action is the link to `/login`.
*/

function summary(overrides: Partial<InstallSetupSummary> = {}): InstallSetupSummary {
  return {
    organizationName: "Visoko Grad",
    profile: "minimum",
    organizationalUnitCount: 1,
    serviceCount: 1,
    groupCount: 1,
    teamMemberCount: 1,
    enabledAddonKeys: ["csat"],
    deferredSteps: [],
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <InstallReadyScreen />
    </MemoryRouter>,
  );
}

describe("InstallReadyScreen", () => {
  afterEach(() => {
    cleanup();
    setupState.summary = null;
  });

  it("reports a Minimum installation and sends the operator to sign in", () => {
    setupState.summary = summary();

    renderScreen();

    expect(screen.getByText("install.ready.profile")).toBeTruthy();
    expect(screen.getByText("install.profile.minimum.title")).toBeTruthy();
    expect(screen.getByText("Visoko Grad")).toBeTruthy();
    expect(screen.getByText("install.ready.units")).toBeTruthy();
    expect(screen.getByText("install.ready.team")).toBeTruthy();
    // The package has one add-on on and nothing was deferred.
    expect(screen.getByText("install.ready.addons")).toBeTruthy();
    expect(screen.queryByText("install.ready.later")).toBeNull();

    const signIn = screen.getByText("install.ready.signIn").closest("a");
    expect(signIn?.getAttribute("href")).toBe("/login");
    // Finishing is the provisioning step's action; this screen only reports.
    expect(screen.queryByText("install.provisioning.finish")).toBeNull();
  });

  it("shows the Full installation's counts, add-ons and deferred steps", () => {
    setupState.summary = summary({
      profile: "full",
      organizationalUnitCount: 3,
      serviceCount: 12,
      groupCount: 5,
      teamMemberCount: 7,
      enabledAddonKeys: ["csat", "cmdb"],
      deferredSteps: ["team", "smtp"],
    });

    renderScreen();

    expect(screen.getByText("install.profile.full.title")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("install.ready.later")).toBeTruthy();
    expect(screen.getByText("install.steps.team")).toBeTruthy();
    expect(screen.getByText("install.steps.smtp")).toBeTruthy();
    // „Pozovi tim“ only makes sense while the team step is still deferred.
    expect(screen.getByText("install.ready.inviteTeam.title")).toBeTruthy();
  });

  it("drops the invite card when the team is already there", () => {
    setupState.summary = summary({ deferredSteps: ["smtp"] });

    renderScreen();

    expect(screen.queryByText("install.ready.inviteTeam.title")).toBeNull();
    expect(screen.getByText("install.ready.firstTicket.title")).toBeTruthy();
    expect(screen.getByText("install.ready.openSettings.title")).toBeTruthy();
  });

  it("renders the next steps even when the status has no summary", () => {
    // A reload after finishing reads the completed status, which carries no
    // summary: the screen degrades to what it knows instead of showing nothing.
    setupState.summary = null;

    renderScreen();

    expect(screen.queryByText("install.ready.profile")).toBeNull();
    expect(screen.getByText("install.ready.firstSteps")).toBeTruthy();
    expect(screen.getByText("install.complete.hint")).toBeTruthy();
  });
});
