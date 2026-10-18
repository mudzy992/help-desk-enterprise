import {
  resolveInstallRailState,
  type InstallRailItem,
} from "@/lib/install/install-rail-state";
import { installWizardSteps } from "@/lib/install/install-step-presentation";
import type { InstallStepState, InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 (F3): the rail of the wizard, derived from the one status
  payload the shell already has. `steps.<key>` carries `completed`, `skipped` and
  `offered` straight from the server registry, so the rail cannot invent a state —
  a step the chosen package does not contain is locked, a deferred step says so.
  `complete` is not a step of the package, it is the end of the wizard: it is
  never „locked“ and it lights up only when the wizard gets there.
*/

export function buildInstallRailItems(input: {
  readonly activeStep: InstallWizardStep;
  readonly states: Readonly<Record<string, InstallStepState>> | undefined;
}): readonly InstallRailItem[] {
  return installWizardSteps.map((step) => {
    const state = input.states?.[step];
    if (step === "complete") {
      return {
        key: step,
        state: resolveInstallRailState({
          isActive: input.activeStep === step,
          isCompleted: false,
          isDeferred: false,
          isOffered: true,
        }),
      };
    }
    return {
      key: step,
      state: resolveInstallRailState({
        isActive: input.activeStep === step,
        isCompleted: state?.completed === true,
        isDeferred: state?.skipped === true,
        isOffered: state?.offered !== false,
      }),
    };
  });
}
