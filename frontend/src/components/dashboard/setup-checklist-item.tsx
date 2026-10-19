import { ArrowRight, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { TranslationKey } from "@/i18n/translation-key";
import { isKnownInstallStepKey, installStepLabelKey } from "@/lib/install/install-wizard-order";
import { setupChecklistTarget } from "@/lib/setup-checklist/setup-checklist-target";
import type { SetupChecklistItem } from "@/services/setup-checklist-api";

/*
  Install wizard v2 (F6.3): one open item. The line is the wizard's own name for
  the thing (a step label or a recommendation title) — the checklist sends the
  operator back to the screen that owns it instead of inventing new wording for
  a decision that was already explained once.
*/

export function SetupChecklistItemRow({ item }: { readonly item: SetupChecklistItem }) {
  const { t } = useTranslation();
  const Icon = item.kind === "recommendation" ? ShieldCheck : SlidersHorizontal;
  // The line comes from the server (`dashboard.setupChecklist.item.*`); a dictionary
  // older than the server falls back to the wizard's own label for the step instead
  // of printing a raw key on the dashboard.
  const fallbackKey =
    item.kind === "step" && isKnownInstallStepKey(item.targetKey)
      ? installStepLabelKey(item.targetKey)
      : null;
  const itemHintKey =
    item.helpKey === undefined ? "dashboard.setupChecklist.itemHint" : item.helpKey;
  return (
    <li className="flex items-start gap-2.5 border-t border-border/70 py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <Icon aria-hidden="true" size={14} strokeWidth={2.1} className="mt-0.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        {/* Both keys come from the server, so they are strings here; the dictionary
            keeps them honest (`dashboard.setupChecklist.item.*`, the F5
            recommendation titles). */}
        <p className="text-[12.5px] leading-5 font-medium text-foreground">
          {t(item.titleKey as TranslationKey, {
            defaultValue: fallbackKey === null ? undefined : t(fallbackKey),
          })}
        </p>
        <p className="text-[11.5px] leading-4 text-muted-foreground">
          {t(itemHintKey as TranslationKey)}
        </p>
      </div>
      <Link
        to={setupChecklistTarget(item)}
        className="mt-0.5 flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-link hover:underline"
      >
        {t("dashboard.setupChecklist.goTo")}
        <ArrowRight aria-hidden="true" size={12} />
      </Link>
    </li>
  );
}
