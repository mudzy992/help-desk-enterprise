import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  installStepLabelKey,
  installStepPresentations,
} from "@/lib/install/install-step-presentation";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 (F3 polish): vertical progress timeline. States come from
  the status endpoint; the rail never decides the flow. `tone="brand"` paints
  translucent primary-foreground over `.pulse-gradient` (Constitution §39).
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
    <ol className="relative m-0 grid list-none gap-0 p-0">
      {items.map((item, index) => {
        const Icon = installStepPresentations[item.key].icon;
        const isLast = index === items.length - 1;
        return (
          <li key={item.key} className="relative flex gap-3 pb-3 last:pb-0">
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[13px] top-7 bottom-0 w-px",
                  isBrand ? "bg-primary-foreground/25" : "bg-border",
                  item.state === "done" && (isBrand ? "bg-primary-foreground/45" : "bg-success/35"),
                )}
              />
            ) : null}

            <span
              aria-hidden="true"
              className={cn(
                "relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border",
                isBrand ? railTileBrandClassName(item.state) : railTileSurfaceClassName(item.state),
              )}
            >
              {item.state === "done" ? (
                <Check size={13} strokeWidth={2.6} />
              ) : (
                <Icon size={13} strokeWidth={2.2} />
              )}
            </span>

            <div
              className={cn(
                "min-w-0 flex-1 rounded-md px-2.5 py-1.5",
                item.state === "current" &&
                  (isBrand ? "bg-primary-foreground/15" : "border border-primary/20 bg-primary/10"),
              )}
            >
              <div className="flex min-w-0 items-baseline gap-2">
                <span
                  className={cn(
                    "truncate text-[12.5px] leading-5",
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
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
                      isBrand
                        ? "bg-primary-foreground/15 text-primary-foreground/80"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t("install.step.skipped")}
                  </span>
                ) : null}
              </div>
              {item.state === "current" ? (
                <p
                  className={cn(
                    "mt-0.5 text-[11px] leading-4",
                    isBrand ? "text-primary-foreground/75" : "text-muted-foreground",
                  )}
                >
                  {t("install.shell.currentStep")}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function railTileSurfaceClassName(state: InstallRailState): string {
  if (state === "current") return "border-primary bg-primary text-primary-foreground shadow-sm";
  if (state === "done") return "border-success/40 bg-success/15 text-ok";
  // Contrast gate: muted-on-alpha fails check C; dashed border carries "locked".
  if (state === "locked") return "border-dashed border-border bg-surface text-muted-foreground";
  if (state === "deferred") return "border-border bg-muted text-muted-foreground";
  return "border-border bg-surface text-muted-foreground";
}

function railLabelSurfaceClassName(state: InstallRailState): string {
  if (state === "current") return "text-foreground";
  if (state === "done" || state === "deferred") return "text-foreground/85";
  return "text-muted-foreground";
}

function railTileBrandClassName(state: InstallRailState): string {
  if (state === "current") {
    return "border-primary-foreground bg-primary-foreground text-primary shadow-sm";
  }
  if (state === "done") return "border-primary-foreground/55 bg-primary-foreground/25";
  if (state === "locked") return "border-dashed border-primary-foreground/40 bg-transparent";
  if (state === "deferred") return "border-primary-foreground/40 bg-primary-foreground/10";
  return "border-primary-foreground/45 bg-transparent";
}

function railLabelBrandClassName(state: InstallRailState): string {
  if (state === "current") return "text-primary-foreground";
  if (state === "done" || state === "deferred") return "text-primary-foreground/90";
  return "text-primary-foreground/70";
}
