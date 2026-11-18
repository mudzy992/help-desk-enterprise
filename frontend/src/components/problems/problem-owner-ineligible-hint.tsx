import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { translateText } from "@/lib/i18n/translate-text";
import {
  problemOwnerIneligibleKey,
  type ProblemOwnerEligibility,
} from "@/lib/problems/problem-owner-eligibility";

/**
 * W7.33 (BA-problems-15): a recorded owner who lost `problem.manage` for the
 * problem's unit (or left its group) keeps the record — history is not rewritten
 * — so the detail has to say why. The hint names the reason and the one action
 * that fixes it; the alarm `problems.owner.ineligible` counts the same drift.
 */
export function ProblemOwnerIneligibleHint({
  eligibility,
}: {
  readonly eligibility: ProblemOwnerEligibility | null;
}) {
  const { t } = useTranslation();
  if (eligibility === null || eligibility.eligible) return null;
  return (
    <span
      role="status"
      data-testid="problem-owner-ineligible"
      className="mt-1 flex items-start gap-1.5 text-[11.5px] text-warning"
    >
      <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium">{t("problems.detail.ownerIneligibleTitle")}</span>{" "}
        {translateText(t, problemOwnerIneligibleKey(eligibility.reason))}{" "}
        {t("problems.detail.ownerIneligibleAction")}
      </span>
    </span>
  );
}
