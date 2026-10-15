import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LocaleSelect } from "@/components/layout/locale-select";
import { InstallBrandPanel } from "@/components/install/shell/install-brand-panel";
import { InstallMobileHeader } from "@/components/install/shell/install-mobile-header";
import {
  installStepIndex,
  installStepLabelKey,
  installStepPresentations,
  installWizardSteps,
} from "@/lib/install/install-step-presentation";
import { useInstallStepTransition } from "@/lib/install/use-install-step-transition";
import type { InstallRailItem } from "@/components/install/shell/install-step-rail";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 (F3): the split-screen shell. Desktop is 5/7 — brand panel
  with the live organisation, the rail and „Šta dobijaš“ on the left, the step
  itself on the right; below `lg` the panel becomes a compact header. The shell
  owns layout and motion only: the step comes from the server (`nextStep` through
  `InstallSetupProvider`), the rail states from `steps`, and nothing here decides
  what the wizard asks next.
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
  const { t } = useTranslation();
  const presentation = installStepPresentations[step];
  const index = installStepIndex(step);
  const { titleRef, stepClassName } = useInstallStepTransition(step);

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[5fr_7fr]">
      <InstallBrandPanel step={step} railItems={railItems} />

      <div className="flex min-w-0 flex-col">
        <InstallMobileHeader
          step={step}
          currentIndex={index}
          totalSteps={installWizardSteps.length}
        />

        <div className="hidden justify-end px-6 pt-5 lg:flex">
          <LocaleSelect />
        </div>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <section key={step} className={`mx-auto w-full max-w-[46rem] ${stepClassName}`}>
            <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              {t("install.shell.stepOf", {
                current: index + 1,
                total: installWizardSteps.length,
              })}{" "}
              · {t(installStepLabelKey(step))}
            </p>
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-foreground outline-none"
            >
              {t(presentation.titleKey as never)}
            </h1>
            <p className="mt-2 max-w-2xl text-[12.5px] leading-5 text-muted-foreground">
              {t(presentation.bodyKey as never)}
            </p>

            <div className="mt-6">{children}</div>
            {footer}
          </section>
        </main>
      </div>
    </div>
  );
}
