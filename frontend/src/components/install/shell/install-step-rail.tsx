import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  installStepLabelKey,
  installStepPresentations,
} from "@/lib/install/install-step-presentation";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 (F3): the vertical rail. It replaces the old horizontal
  stepper for the installer and shows four states read from the server
  (`InstallStepState`): done (completed), deferred („Podesi kasnije“), locked
  (the package does not offer the step) and still to come. Nothing here decides
  the flow — states come from the status endpoint, the order from
  `installWizardSteps`.

  `tone="brand"` is for the gradient brand panel (F3, Constitution §39): there
  every colour is a translucent `primary-foreground`, the way the sign-in panel
  paints its points, so the rail stays readable in both light and dark mode.
*/

export type InstallRailState = "done" | "current" | "deferred" | "locked" | "upcoming";
export type InstallRailTone = "brand" | "surface";

export type InstallRailItem = {
  readonly key: InstallWizardStep;
  readonly state: InstallRailState;
};

/** The state of one step, in the order the rail and the tests read it. */
export function resolveInstallRailState(input: {
  readonly isActive: boolean;
  readonly isCompleted: boolean;
  readonly isDeferred: boolean;
  readonly isOffered: boolean;
}): InstallRailState {
  if (!input.isOffered) return "locked";
  if (input.isActive) return "current";
  if (input.isCompleted) return "done";
  if (input.isDeferred) return "deferred";
  return "upcoming";
}

export function InstallStepRail({
  items,
  tone = "surface",
}: {
  readonly items: readonly InstallRailItem[];
  readonly tone?: InstallRailTone;
}) {
  const { t } = useTranslation();
  const isBrand = tone === "brand";
  return (
    <ol className="grid gap-1.5">
      {items.map((item) => {
        const Icon = installStepPresentations[item.key].icon;
        return (
          <li key={item.key} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border",
                isBrand ? railTileBrandClassName(item.state) : railTileSurfaceClassName(item.state),
              )}
            >
              {item.state === "done" ? (
                <Check size={12} strokeWidth={2.6} />
              ) : (
                <Icon size={12} strokeWidth={2.2} />
              )}
            </span>
            <span
              className={cn(
                "truncate text-[12.5px]",
                item.state === "current" ? "font-semibold" : "font-medium",
                isBrand
                  ? railLabelBrandClassName(item.state)
                  : railLabelSurfaceClassName(item.state),
              )}
            >
              {t(installStepLabelKey(item.key))}
            </span>
            {item.state === "deferred" ? (
              <span
                className={cn(
                  "shrink-0 text-[10.5px]",
                  isBrand ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {t("install.step.skipped")}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function railTileSurfaceClassName(state: InstallRailState): string {
  if (state === "current") return "border-primary bg-primary text-primary-foreground";
  if (state === "done") return "border-success/40 bg-success/15 text-ok";
  // Contrast gate (`scripts/check-theme-contrast.mjs`, check C): a muted token with
  // alpha drops below 4.5:1 on the rail surface. "Locked" is told apart by the
  // dashed tile and the muted label, not by a lighter grey.
  if (state === "locked") return "border-dashed border-border text-muted-foreground";
  return "border-border text-muted-foreground";
}

function railLabelSurfaceClassName(state: InstallRailState): string {
  if (state === "current") return "text-foreground";
  if (state === "done" || state === "deferred") return "text-foreground/85";
  return "text-muted-foreground";
}

function railTileBrandClassName(state: InstallRailState): string {
  if (state === "current") return "border-primary-foreground bg-primary-foreground/30";
  if (state === "done") return "border-primary-foreground/50 bg-primary-foreground/20";
  if (state === "locked") return "border-dashed border-primary-foreground/40";
  return "border-primary-foreground/50";
}

function railLabelBrandClassName(state: InstallRailState): string {
  if (state === "current") return "text-primary-foreground";
  if (state === "done" || state === "deferred") return "text-primary-foreground/90";
  return "text-primary-foreground/70";
}
