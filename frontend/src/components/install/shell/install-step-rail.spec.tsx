// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InstallStepRail,
  resolveInstallRailState,
  type InstallRailItem,
} from "@/components/install/shell/install-step-rail";
import { installWizardSteps } from "@/lib/install/install-wizard-order";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/*
  F3: the rail is the wizard's map. Every state it can show comes from the status
  endpoint (`InstallStepState`), so these tests pin both the derivation and the
  rendering — „završeno“, „trenutno“, „odgođeno“, „zaključano“ (the package does
  not offer the step) and „tek slijedi“.

  Aurora: fourteen steps do not fit a screen, so the map is a *window* — it
  scrolls, it fades while it overflows, it takes focus only while it really
  overflows, and it re-centres on the active step at every step change. Those
  four are layout facts jsdom does not have, so the tests state them (a 52 px
  row, a 300 px window) instead of hoping the browser would.
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

    expect(screen.getByText("install.steps.profile")).toBeTruthy();
    expect(screen.getByText("install.steps.superAdmin")).toBeTruthy();
    expect(screen.getByText("install.steps.identity")).toBeTruthy();
    expect(screen.getByText("install.steps.smtp")).toBeTruthy();
    expect(screen.getByText("install.steps.seed")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("marks the deferred step as deferred instead of counting it as done", () => {
    render(<InstallStepRail items={items} />);

    const deferred = screen.getByText("install.steps.identity");
    expect(deferred.closest("li")?.textContent).toContain("install.step.skipped");
    expect(screen.getByText("install.shell.currentStep")).toBeTruthy();
    expect(screen.queryByText("install.steps.smtp")?.className).toContain("muted");
  });
});

/** jsdom has no layout, so the layout is stated: a 52 px row and a fixed window. */
function stubLayout(input: {
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly rowHeight: number;
}): void {
  const prototype = HTMLElement.prototype;
  const define = (name: string, read: (element: HTMLElement) => number) => {
    Object.defineProperty(prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return read(this);
      },
    });
  };
  define("clientHeight", () => input.clientHeight);
  define("scrollHeight", () => input.scrollHeight);

  // Rows stack from the window's top edge, 52 px apart — the real centring math
  // is then exercised, not stubbed away.
  const rowIndex = (element: Element): number =>
    element.classList.contains("iw-rail-item") && element.parentElement !== null
      ? Array.prototype.indexOf.call(element.parentElement.children, element)
      : 0;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const top = rowIndex(this) * input.rowHeight;
    const height = this.classList.contains("iw-rail-item") ? input.rowHeight : input.clientHeight;
    return {
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  };
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    overflowX: "visible",
    overflowY: "auto",
  } as CSSStyleDeclaration);
}

function clearLayout(): void {
  for (const name of ["clientHeight", "scrollHeight"]) {
    Reflect.deleteProperty(HTMLElement.prototype, name);
  }
  Reflect.deleteProperty(Element.prototype, "getBoundingClientRect");
  vi.restoreAllMocks();
}

// The real wizard list, not a stand-in: the map has to hold every step the
// registry can declare, which is the reason the window exists at all.
const everyStep: readonly InstallRailItem[] = installWizardSteps.map((key, index) => ({
  key,
  state: index === 0 ? "current" : "upcoming",
}));

const deepStart: readonly InstallRailItem[] = everyStep.map((item, index) => ({
  ...item,
  state: index === 0 ? "done" : index === 9 ? "current" : "upcoming",
}));

describe("InstallStepRail — the window (Aurora)", () => {
  afterEach(() => {
    clearLayout();
    cleanup();
  });

  it("stays a plain list while every step fits: no fade, no extra tab stop", () => {
    stubLayout({ clientHeight: 900, scrollHeight: 900, rowHeight: 52 });
    const { container } = render(<InstallStepRail items={everyStep} />);

    const window_ = container.querySelector(".iw-rail-window");
    expect(window_?.getAttribute("data-scrollable")).toBe("false");
    expect(window_?.getAttribute("role")).toBeNull();
    expect(window_?.getAttribute("tabindex")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(installWizardSteps.length);
  });

  it("becomes a fade, a scrollbar and a named region only when it overflows", () => {
    stubLayout({ clientHeight: 300, scrollHeight: 900, rowHeight: 52 });
    const { container } = render(<InstallStepRail items={everyStep} />);

    const window_ = container.querySelector(".iw-rail-window");
    expect(window_?.getAttribute("data-scrollable")).toBe("true");
    // Same rule as `components/ui/scroll-region.tsx`: the region takes focus
    // itself only while it holds nothing focusable (WCAG 2.1.1).
    expect(window_?.getAttribute("role")).toBe("region");
    expect(window_?.getAttribute("tabindex")).toBe("0");
    expect(window_?.getAttribute("aria-label")).toBe("a11y.scrollRegion");
  });

  it("re-centres on the active step at every step change", () => {
    stubLayout({ clientHeight: 300, scrollHeight: 900, rowHeight: 52 });
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    const { rerender } = render(<InstallStepRail items={everyStep} />);

    // Row 0 in a 300 px window: nothing to scroll yet, but the call is made.
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });

    rerender(<InstallStepRail items={deepStart} />);

    // Row 9 of a 52 px row, centred in a 300 px window: 9 × 52 − (300 − 52) / 2.
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 344, behavior: "smooth" });
    Reflect.deleteProperty(Element.prototype, "scrollTo");
  });
});
