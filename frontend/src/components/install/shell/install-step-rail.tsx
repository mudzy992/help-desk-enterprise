import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  installStepLabelKey,
  installStepPresentations,
} from "@/lib/install/install-step-presentation";
import type { InstallWizardStep } from "@/services/install-api";
import type { CSSProperties } from "react";

/*
  Install wizard v2 — „Aurora“: the rail is a vertical flight timeline.

  Five states come from `GET /install/status` and nothing here decides the flow:
  `done` (answered), `current` (where the operator stands), `deferred` (they said
  „kasnije“), `locked` (the package does not offer it) and `upcoming`.

  The line behind the nodes is one element filling from the top
  (`--iw-rail-progress`), so „how far are we“ is one CSS transition and not a
  list of conditional borders. Motion is decoration: `install-scenes.css` turns
  it off under `prefers-reduced-motion`.
*/

export type InstallRailState = "done" | "current" | "deferred" | "locked" | "upcoming";

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

/** How full the timeline is: the index of the last step that is not ahead. */
function railProgress(items: readonly InstallRailItem[]): number {
  if (items.length < 2) return 0;
  const lastReached = items.reduce(
    (found, item, index) => (item.state === "upcoming" || item.state === "locked" ? found : index),
    0,
  );
  return Math.round((lastReached / (items.length - 1)) * 100);
}

/** A custom property is not part of `CSSProperties`, so it is asserted once, here. */
function railStyle(percent: number): CSSProperties {
  return { "--iw-rail-progress": `${percent}%` } as CSSProperties;
}

export function InstallStepRail({ items }: { readonly items: readonly InstallRailItem[] }) {
  const { t } = useTranslation();

  return (
    <ol className="iw-rail" style={railStyle(railProgress(items))}>
      {items.map((item) => {
        const Icon = installStepPresentations[item.key].icon;
        const isAhead = item.state === "upcoming" || item.state === "locked";
        return (
          <li key={item.key} className="iw-rail-item" data-state={item.state}>
            <span className="iw-node" data-state={item.state} aria-hidden="true">
              {item.state === "done" ? <Check size={15} strokeWidth={2.7} /> : <Icon size={15} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "iw-rail-label",
                    item.state === "current" && "font-semibold text-foreground",
                    !isAhead && item.state !== "current" && "text-foreground/85",
                    isAhead && "text-muted-foreground",
                    item.state === "deferred" && "text-warning",
                  )}
                >
                  {t(installStepLabelKey(item.key))}
                </span>
                {item.state === "deferred" ? (
                  <span className="iw-badge shrink-0 px-1.5 py-px text-[10px] font-semibold tracking-[0.04em] uppercase">
                    {t("install.step.skipped")}
                  </span>
                ) : null}
              </span>
              {item.state === "current" ? (
                <span className="iw-rail-note">{t("install.shell.currentStep")}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
