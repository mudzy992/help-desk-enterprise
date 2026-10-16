import type { ReactNode } from "react";
import { InstallAuroraBackdrop } from "@/components/install/shell/install-aurora-backdrop";
import { InstallFlightPlan } from "@/components/install/shell/install-flight-plan";
import { InstallStepHeader } from "@/components/install/shell/install-step-header";
import { InstallTopBar } from "@/components/install/shell/install-top-bar";
import { useInstallStepTransition } from "@/lib/install/use-install-step-transition";
import { useInstallTheme } from "@/lib/install/use-install-theme";
import type { InstallRailItem } from "@/components/install/shell/install-step-rail";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 — „Aurora“ (owner decision, 2026-10-16): the wizard is its
  own visual story. The shell owns layout and motion only: the step comes from
  the server (`nextStep` through `InstallSetupProvider`), the rail states from
  `steps`, and nothing here decides what the wizard asks next.

  Layout: the aurora canvas, one HUD at the top, the flight plan on the left
  (`lg` and up) and the step on a lit glass panel in the middle of the rest.
  `useInstallTheme` pins the palette on `<html>` so sheets and dialogs — which
  portal out of this subtree — are part of the same screen.
*/

export type InstallWizardShellProperties = {
  readonly step: InstallWizardStep;
  readonly railItems: readonly InstallRailItem[];
  readonly children: ReactNode;
  readonly footer: ReactNode;
};

export function InstallWizardShell({
  step,
  railItems,
  children,
  footer,
}: InstallWizardShellProperties) {
  useInstallTheme();
  const { titleRef, stepClassName } = useInstallStepTransition(step);

  return (
    <div className="iw-canvas">
      <InstallAuroraBackdrop />
      <InstallTopBar step={step} railItems={railItems} />

      <div className="mx-auto grid w-full max-w-[86rem] gap-6 px-4 py-7 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:py-9">
        <InstallFlightPlan step={step} railItems={railItems} />

        <main className="min-w-0">
          <section key={step} className={`iw-panel iw-panel--lit p-5 sm:p-7 ${stepClassName}`}>
            <InstallStepHeader step={step} titleRef={titleRef} />
            <div className="mt-7">{children}</div>
            {footer}
          </section>
        </main>
      </div>
    </div>
  );
}
