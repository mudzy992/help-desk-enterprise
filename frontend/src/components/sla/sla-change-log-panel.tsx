import { useTranslation } from "react-i18next";
import { RelativeTime } from "@/components/ui/relative-time";
import { EmptyState } from "@/components/ui/empty-state";
import { tableHeadClassName, tableRowClassName, tableWrapClassName } from "@/components/ui/control";
import type { SlaChangeLogEntry } from "@/services/sla-api";

interface SlaChangeLogPanelProperties {
  readonly entries: readonly SlaChangeLogEntry[];
}

export function SlaChangeLogPanel({ entries }: SlaChangeLogPanelProperties) {
  const { t, i18n } = useTranslation();
  if (entries.length === 0) {
    return (
      <EmptyState
        title={t("sla.changeLogEmptyTitle")}
        body={t("sla.changeLogEmptyBody")}
      />
    );
  }
  return (
    <div className={tableWrapClassName}>
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-border/70">
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.changeWhen")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.changeWho")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.changeReason")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.changeDiff")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className={tableRowClassName}>
              <td className="px-4 text-[12.5px]">
                <RelativeTime value={entry.createdAt} locale={i18n.language} />
              </td>
              <td className="px-4 text-[12.5px]">
                {entry.actorDisplayName ?? t("sla.changeUnknownActor")}
              </td>
              <td className="px-4 text-[12.5px]">{entry.reason}</td>
              <td className="px-4 text-[12px] text-muted-foreground">
                {entry.diff.changes.length === 0
                  ? entry.diff.action
                  : entry.diff.changes
                      .map(
                        (change) =>
                          `${change.path}: ${stringifyChange(change.before)} → ${stringifyChange(change.after)}`,
                      )
                      .join("; ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function stringifyChange(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
