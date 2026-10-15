import { useTranslation } from "react-i18next";
import { hintClassName } from "@/components/ui/control";
import type { InstallSlaReviewMatrixCell } from "@/services/install-content-api";

/*
  Install wizard v2 (F4.4): the priority matrix the installation starts with, as a
  4×4 grid — read-only on purpose. The wizard's job is that the operator *sees*
  which combination of impact and urgency produces which priority; changing it is
  a deliberate act and belongs on the SLA screen, where the cell also has to be
  confirmed with a reason.
*/
const levels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export function InstallPriorityMatrixPreview({
  cells,
}: {
  readonly cells: readonly InstallSlaReviewMatrixCell[];
}) {
  const { t } = useTranslation();
  const priorityOf = (impact: string, urgency: string) =>
    cells.find((cell) => cell.impact === impact && cell.urgency === urgency)?.priority ??
    t("install.slaReview.matrix.unknown");

  return (
    <div className="grid gap-2">
      <table className="w-full border-collapse text-sm">
        <caption className={hintClassName}>{t("install.slaReview.matrix.caption")}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="p-1 text-left text-xs uppercase tracking-wide text-muted-foreground"
            >
              {t("install.slaReview.matrix.impact")}
            </th>
            {levels.map((urgency) => (
              <th
                key={urgency}
                scope="col"
                className="p-1 text-xs uppercase tracking-wide text-muted-foreground"
              >
                {t(`install.slaReview.level.${urgency}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.map((impact) => (
            <tr key={impact} className="border-t border-border">
              <th scope="row" className="p-1 text-left font-normal text-foreground">
                {t(`install.slaReview.level.${impact}`)}
              </th>
              {levels.map((urgency) => (
                <td key={urgency} className="p-1 text-center text-foreground">
                  {priorityOf(impact, urgency)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={hintClassName}>{t("install.slaReview.matrix.hint")}</p>
    </div>
  );
}
