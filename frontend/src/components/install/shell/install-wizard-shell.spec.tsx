// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallWizardShell } from "@/components/install/shell/install-wizard-shell";
import type { InstallRailItem } from "@/components/install/shell/install-step-rail";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/branding/branding-store", () => ({
  useBranding: () => ({
    appName: "Service Desk",
    tagline: "",
    organizationName: "Gradska uprava Visoko",
    logoDataUrl: "",
    supportEmail: "",
    supportUrl: "",
  }),
}));

// The shell renders the locale switcher in its desktop header; the real one talks
// to the locale store, which is not what this spec is about.
vi.mock("@/components/layout/locale-select", () => ({
  LocaleSelect: () => <span />,
}));

const railItems: readonly InstallRailItem[] = [
  { key: "profile", state: "done" },
  { key: "superAdmin", state: "current" },
];

function stubReducedMotion(isReduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? isReduced : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => stubReducedMotion(false));

/*
  F3: the shell is layout and motion only. These tests pin the two promises the
  plan makes about it — the headline (not the button) takes focus when the step
  changes, and nothing animates when the system asks for reduced motion.
*/
describe("InstallWizardShell", () => {
  it("shows the step, the step counter, the live organisation and what the step brings", () => {
    render(
      <InstallWizardShell step="superAdmin" railItems={railItems} footer={<span>footer</span>}>
        <p>body</p>
      </InstallWizardShell>,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("install.heading");
    expect(screen.getByText("install.body")).toBeTruthy();
    // 2 of 9 — the package picker is the first step (F3).
    expect(screen.getAllByText(/install\.shell\.stepOf/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("install.steps.superAdmin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gradska uprava Visoko").length).toBeGreaterThan(0);
    expect(screen.getByText("install.whatYouGet.superAdmin.1")).toBeTruthy();
    expect(screen.getByText("install.shell.whatYouGet")).toBeTruthy();
  });

  it("moves focus to the headline when the step changes", () => {
    const { rerender } = render(
      <InstallWizardShell step="superAdmin" railItems={railItems} footer={null}>
        <p>body</p>
      </InstallWizardShell>,
    );
    const first = screen.getByRole("heading", { level: 1 });
    first.blur();
    expect(document.activeElement).not.toBe(first);

    rerender(
      <InstallWizardShell step="identity" railItems={railItems} footer={null}>
        <p>body</p>
      </InstallWizardShell>,
    );

    const second = screen.getByRole("heading", { level: 1 });
    expect(document.activeElement).toBe(second);
    expect(second.textContent).toBe("install.identity.heading");
  });

  it("animates the step transition while motion is allowed", () => {
    render(
      <InstallWizardShell step="superAdmin" railItems={railItems} footer={null}>
        <p>body</p>
      </InstallWizardShell>,
    );
    expect(screen.getByRole("heading", { level: 1 }).closest("section")?.className).toContain(
      "page-in",
    );
  });

  it("drops the step transition when the system asks for reduced motion", () => {
    // The hook reads the setting when the shell mounts (that is when the operator's
    // system preference is visible to us), so the stub is set before rendering.
    stubReducedMotion(true);
    render(
      <InstallWizardShell step="identity" railItems={railItems} footer={null}>
        <p>body</p>
      </InstallWizardShell>,
    );
    expect(screen.getByRole("heading", { level: 1 }).closest("section")?.className).not.toContain(
      "page-in",
    );
  });
});
