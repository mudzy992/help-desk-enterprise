import { useTranslation } from "react-i18next";
import { LocaleSelect } from "@/components/layout/locale-select";
import { BrandMark } from "@/components/layout/brand-mark";
import { useBranding } from "@/lib/branding/branding-store";
import { installStepIndex, installWizardSteps } from "@/lib/install/install-step-presentation";
import type { InstallRailItem } from "@/components/install/shell/install-step-rail";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 — „Aurora“: the HUD.

  It replaces the old split-screen brand panel and the separate mobile header
  with one sticky bar at every width: who is being installed, how far the run
  is (one segment per step — answered, current, ahead) and the locale switch.
  The segments are `aria-hidden` decoration; the `progressbar` role and the
  „Korak X od Y“ line carry the same information to a screen reader.
*/

export function InstallTopBar({
  step,
  railItems,
}: {
  readonly step: InstallWizardStep;
  readonly railItems: readonly InstallRailItem[];
}) {
  const { t } = useTranslation();
  const { organizationName, appName } = useBranding();
  const index = installStepIndex(step);
  const total = installWizardSteps.length;
  const shownName =
    organizationName.length > 0 ? organizationName : t("install.shell.organizationFallback");

  return (
    <header className="iw-hud">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-2.5 px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <BrandMark size={30} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="iw-display block truncate text-[15px] text-foreground">
              {shownName}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">{appName}</span>
          </span>
          <LocaleSelect />
        </div>

        <div className="flex items-center gap-3">
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={index + 1}
            aria-label={t("install.shell.stepOf", { current: index + 1, total })}
            className="flex flex-1 gap-1"
          >
            {railItems.map((item) => (
              <span
                key={item.key}
                aria-hidden="true"
                className="iw-seg"
                data-state={
                  item.state === "done" || item.state === "current" ? item.state : "ahead"
                }
              />
            ))}
          </span>
          <span className="iw-num text-[11px] text-muted-foreground">
            {t("install.shell.stepOf", { current: index + 1, total })}
          </span>
        </div>
      </div>
    </header>
  );
}
