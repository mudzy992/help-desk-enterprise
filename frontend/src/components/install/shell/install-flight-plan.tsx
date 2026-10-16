import { useTranslation } from "react-i18next";
import {
  InstallStepRail,
  type InstallRailItem,
} from "@/components/install/shell/install-step-rail";
import { InstallWhatYouGetPanel } from "@/components/install/shell/install-what-you-get-panel";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 — „Aurora“: the left column of the shell.

  It is the wizard's map and its reason: the flight plan (every step, where the
  run stands) and, right under it, what the step on screen brings. On phones it
  folds away — the HUD shows the same progress as segments, and the step itself
  is the only thing worth the screen there.
*/

export function InstallFlightPlan({
  step,
  railItems,
}: {
  readonly step: InstallWizardStep;
  readonly railItems: readonly InstallRailItem[];
}) {
  const { t } = useTranslation();
  return (
    <aside className="grid content-start gap-4 lg:sticky lg:top-24">
      <nav aria-label={t("install.shell.stepsLabel")} className="iw-panel hidden p-4 lg:block">
        <InstallStepRail items={railItems} />
      </nav>
      <div className="hidden lg:block">
        <InstallWhatYouGetPanel step={step} />
      </div>
    </aside>
  );
}
