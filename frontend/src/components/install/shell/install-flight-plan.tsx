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

  On a desktop the column is capped to the viewport (`.iw-plan` in
  `install-theme.css`): fourteen steps are taller than any screen, so the map
  scrolls inside its own window instead of pushing „what you get“ off the page.
  On a short screen the panel gives its room to the map.
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
    <aside className="iw-plan lg:sticky lg:top-24">
      <nav
        aria-label={t("install.shell.stepsLabel")}
        className="iw-plan-map iw-panel hidden min-h-0 p-4"
      >
        <InstallStepRail items={railItems} />
      </nav>
      <div className="iw-plan-extra hidden">
        <InstallWhatYouGetPanel step={step} />
      </div>
    </aside>
  );
}
