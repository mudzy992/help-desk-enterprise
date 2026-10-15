import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { hintClassName } from "@/components/ui/control";
import { InstallFeatureCard } from "@/components/install/install-feature-card";
import {
  listInstallProfileStepItems,
  readInstallProfileItemPresentation,
} from "@/lib/install/install-profile-items";
import type { InstallProfileItem, InstallStepKey } from "@/services/install-profile-api";
import type { InstallStepState } from "@/services/install-api";

/*
  Install wizard v2 (F3): „Prilagodi“ under the package cards. Owner decision D1
  allows fine-tuning inside a package; the honest version of that today is the
  F1 deferral mechanism — a switch turns the step off for this wizard run
  (`POST /install/steps/:stepKey/skip`), which readiness, the next step and the
  post-install checklist all read. Items the chosen package walks but the registry
  does not allow deferring are locked with the reason; catalogue lines that no
  step owns yet are package content and are shown in the cards / „Prikaži sve“,
  never as a switch that would do nothing.
*/

export function InstallProfileCustomize({
  items,
  states,
  deferred,
  isPending,
  onToggle,
}: {
  readonly items: readonly InstallProfileItem[];
  readonly states: Readonly<Record<string, InstallStepState>> | undefined;
  readonly deferred: ReadonlySet<InstallStepKey>;
  readonly isPending: boolean;
  readonly onToggle: (stepKey: InstallStepKey, shouldDefer: boolean) => void;
}) {
  const { t } = useTranslation();
  const rows = listInstallProfileStepItems(items);

  return (
    <section aria-labelledby="install-profile-customize-title" className="grid gap-2.5">
      <div>
        <h2
          id="install-profile-customize-title"
          className="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
        >
          {t("install.profile.customize")}
        </h2>
        <p className={hintClassName}>{t("install.profile.customizeHint")}</p>
      </div>

      {rows.map((row) => {
        const state = states?.[row.stepKey];
        const canDefer = state?.skippable === true;
        const isDeferred = deferred.has(row.stepKey);
        return (
          <InstallFeatureCard
            key={row.itemKey}
            icon={readInstallProfileItemPresentation(row.itemKey).icon}
            title={t(row.labelKey as never)}
            control={canDefer ? "switch" : "locked"}
            checked={!isDeferred}
            disabledReason={canDefer ? undefined : t("install.profile.lockedHint")}
            onCheckedChange={(checked) => {
              if (!canDefer || isPending) return;
              onToggle(row.stepKey, !checked);
            }}
          />
        );
      })}

      <p className="flex items-start gap-1.5 text-[11.5px] leading-5 text-muted-foreground">
        <Lock size={12} strokeWidth={2.2} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t("install.profile.customizeFootNote")}
      </p>
    </section>
  );
}
