// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useInstallStepNavigation } from "@/lib/install/use-install-step-navigation";
import type { InstallStepKey, InstallStepState } from "@/services/install-api";

/*
  F3/IN11: „Nazad“ is a review, not a cursor. The wizard keeps following the
  server; the shell only lets the operator look at a step they already answered,
  and never at a locked step or one they have not reached.
*/

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

function states(overrides: Partial<Record<InstallStepKey, InstallStepState>> = {}) {
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

afterEach(cleanup);

describe("useInstallStepNavigation", () => {
  it("renders the server's step and only offers „Nazad“ once something is behind it", () => {
    const first = renderHook(() =>
      useInstallStepNavigation({ serverStep: "profile", states: states() }),
    );
    expect(first.result.current.step).toBe("profile");
    expect(first.result.current.canGoBack).toBe(false);
    first.unmount();

    const later = renderHook(() =>
      useInstallStepNavigation({
        serverStep: "seed",
        states: states({ profile: { completed: true, blocking: false } }),
      }),
    );
    expect(later.result.current.canGoBack).toBe(true);
  });

  it("opens the previous answered step and returns to the server's step with „Nastavi“", () => {
    const { result } = renderHook(() =>
      useInstallStepNavigation({
        serverStep: "seed",
        states: states({
          profile: { completed: true, blocking: false },
          superAdmin: { completed: true, blocking: false },
        }),
      }),
    );

    act(() => result.current.goBack());
    expect(result.current.step).toBe("superAdmin");

    act(() => result.current.goBack());
    expect(result.current.step).toBe("profile");
    expect(result.current.canGoBack).toBe(false);

    act(() => result.current.continueForward());
    expect(result.current.step).toBe("seed");
  });

  it("skips locked and unanswered steps instead of showing a form nobody can save", () => {
    const { result } = renderHook(() =>
      useInstallStepNavigation({
        serverStep: "seed",
        states: states({
          profile: { completed: true, blocking: false },
          superAdmin: { completed: true, blocking: false },
          // SMTP is not part of this package: it may not be reviewed …
          smtp: { completed: false, offered: false, blocking: false },
          // … and identity was never answered, so „Nazad“ does not open it.
        }),
      }),
    );

    act(() => result.current.goBack());
    expect(result.current.step).toBe("superAdmin");
  });

  it("drops the review when the server moves the wizard on", () => {
    const { result, rerender } = renderHook(
      ({ serverStep }: { readonly serverStep: "seed" | "team" }) =>
        useInstallStepNavigation({
          serverStep,
          states: states({ profile: { completed: true, blocking: false } }),
        }),
      { initialProps: { serverStep: "seed" as "seed" | "team" } },
    );

    act(() => result.current.goBack());
    expect(result.current.step).toBe("profile");

    rerender({ serverStep: "team" });
    expect(result.current.step).toBe("team");
  });
});
