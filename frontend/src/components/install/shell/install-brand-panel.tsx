import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/layout/brand-mark";
import {
  InstallStepRail,
  type InstallRailItem,
} from "@/components/install/shell/install-step-rail";
import { InstallWhatYouGetPanel } from "@/components/install/shell/install-what-you-get-panel";
import { useBranding } from "@/lib/branding/branding-store";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 (F3): the left half of the split screen. This is the one
  brand surface the product allows (Constitution §39, decision D2) — and it is
  not decoration: the organisation name and the logo are read through the same
  branding store the sign-in page uses, so the operator watches their own
  installation appear while they set it up. Colours follow the sign-in panel:
  translucent `primary-foreground` over `.pulse-gradient`, which keeps contrast
  in Pulse light/dark, classic and all three accents.
*/

export function InstallBrandPanel({
  step,
  railItems,
}: {
  readonly step: InstallWizardStep;
  readonly railItems: readonly InstallRailItem[];
}) {
  const { t } = useTranslation();
  const { organizationName, appName } = useBranding();
  const shownName =
    organizationName.length > 0 ? organizationName : t("install.shell.organizationFallback");

  return (
    <aside className="pulse-gradient relative hidden flex-col gap-7 overflow-hidden p-7 lg:flex">
      <div className="flex items-center gap-2.5">
        <BrandMark size={34} className="shadow-none" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-semibold tracking-[-0.02em] text-primary-foreground">
            {shownName}
          </span>
          <span className="block truncate text-[11px] text-primary-foreground/80">{appName}</span>
        </span>
      </div>

      <nav aria-label={t("install.shell.stepsLabel")} className="flex-1">
        <InstallStepRail items={railItems} tone="brand" />
      </nav>

      <InstallWhatYouGetPanel step={step} tone="brand" />
    </aside>
  );
}
