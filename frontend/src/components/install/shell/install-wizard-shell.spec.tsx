// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallStepFooter } from "@/components/install/shell/install-step-footer";
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
  F3: the shell is layout and motion only. These tests pin the promises the plan
  makes about it — the headline (not the button) takes focus when the step
  changes, nothing animates when the system asks for reduced motion, and the
  shell's own furniture never gets in the way of the E2E harness: the step's
  form comes first, and every footer control is `type="button"` so a second
  submit button cannot steal `form button[type="submit"]`
  (`e2e/install-wizard/install-wizard-submit.ts` clicks exactly that).
*/

/** The pattern `e2e/install-wizard/install-wizard-submit.ts` clicks with. */
const submitPattern =
  /dalje|nastavi|continue|next|sačuvaj|save|kreiraj|create|primijeni|apply|potvrdi|confirm/i;
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
  it("puts the step's own form before the footer and keeps every footer control a plain button", () => {
    const { container } = render(
      <InstallWizardShell
        step="identity"
        railItems={railItems}
        footer={
          <InstallStepFooter
            canGoBack
            onBack={() => undefined}
            isDeferred={false}
            canDefer
            isDeferring={false}
            onDefer={() => undefined}
            onUndoDefer={() => undefined}
            onContinue={() => undefined}
            isContinueVisible
          />
        }
      >
        <form>
          <button type="submit">sačuvaj identitet</button>
        </form>
      </InstallWizardShell>,
    );

    // Both selectors the harness uses have to land on the step's own control.
    const submits = Array.from(container.querySelectorAll('button[type="submit"]'));
    expect(submits).toHaveLength(1);
    expect(submits[0]?.textContent).toBe("sačuvaj identitet");
    const labelled = Array.from(container.querySelectorAll("button")).filter((button) =>
      submitPattern.test(button.textContent ?? ""),
    );
    expect(labelled[0]?.textContent).toBe("sačuvaj identitet");

    for (const name of ["install.shell.back", "install.shell.later", "install.shell.continue"]) {
      const footerButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === name,
      );
      expect(footerButton, name).toBeTruthy();
      expect(footerButton?.getAttribute("type"), name).toBe("button");
    }
  });
});
