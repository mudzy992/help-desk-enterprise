import { describe, expect, it } from "vitest";
import { resolveRenderedStep } from "@/lib/install/resolve-rendered-step";
import type { InstallStepKey, InstallStepState, InstallWizardStep } from "@/services/install-api";

function steps(
  blocking: readonly InstallStepKey[] = [],
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
    "provisioning",
  ];
  return Object.fromEntries(
    keys.map((key) => [key, { completed: false, blocking: blocking.includes(key) }]),
  ) as Readonly<Record<InstallStepKey, InstallStepState>>;
}

/*
  F0.3 (IN4/IN5): the shell follows the server's answer. It used to fall back to
  a hard-coded `superAdmin` whenever the second status request failed, which sent
  an operator who had already seeded back to the first screen.
*/
describe("resolveRenderedStep", () => {
  it("renders the step the server reports as next", () => {
    expect(resolveRenderedStep({ nextStep: "seed", isCompleted: false, steps: undefined })).toBe(
      "seed",
    );
  });

  it("renders the F2 steps and the F3 package picker", () => {
    // F2/F3: identity, team and the package picker are no longer foreign steps
    // the shell has to work around — they are rendered directly.
    expect(resolveRenderedStep({ nextStep: "identity", isCompleted: false, steps: steps() })).toBe(
      "identity",
    );
    expect(resolveRenderedStep({ nextStep: "team", isCompleted: false, steps: steps() })).toBe(
      "team",
    );
    expect(resolveRenderedStep({ nextStep: "profile", isCompleted: false, steps: steps() })).toBe(
      "profile",
    );
  });

  it("shows the final screen once the installation is completed", () => {
    expect(resolveRenderedStep({ nextStep: undefined, isCompleted: true, steps: undefined })).toBe(
      "complete",
    );
  });

  it("falls back to the first blocking step when the answer is a step this shell cannot render", () => {
    // A step the shell has no screen for (the server may grow one): the fallback
    // walks the wizard order and shows what the package still blocks on.
    expect(resolveRenderedStep({ nextStep: "seed", isCompleted: false, steps: undefined })).toBe(
      "seed",
    );
    const unknown = "notAStep" as unknown as InstallWizardStep;
    expect(
      resolveRenderedStep({ nextStep: unknown, isCompleted: false, steps: steps(["identity"]) }),
    ).toBe("identity");
  });

  it("renders the readiness screen and the final screen (F6)", () => {
    // F6.1/F6.2: the readiness screen is a step of the wizard, and the final
    // screen is what the shell shows once the installation is completed.
    expect(
      resolveRenderedStep({ nextStep: "provisioning", isCompleted: false, steps: steps() }),
    ).toBe("provisioning");
    expect(
      resolveRenderedStep({ nextStep: "provisioning", isCompleted: true, steps: steps() }),
    ).toBe("complete");
    // A server that reports something this shell cannot draw still falls back to
    // the readiness screen when it is the step that blocks.
    const unknown = "notAStep" as unknown as InstallWizardStep;
    expect(
      resolveRenderedStep({
        nextStep: unknown,
        isCompleted: false,
        steps: steps(["provisioning"]),
      }),
    ).toBe("provisioning");
  });

  it("never invents a step it was not told about", () => {
    // The package picker is the wizard's first step (F3), so it is the honest
    // last resort — never a blind `superAdmin` past an unanswered package.
    expect(resolveRenderedStep({ nextStep: undefined, isCompleted: false, steps: steps() })).toBe(
      "profile",
    );
    expect(resolveRenderedStep({ nextStep: undefined, isCompleted: false, steps: undefined })).toBe(
      "profile",
    );
  });
});
