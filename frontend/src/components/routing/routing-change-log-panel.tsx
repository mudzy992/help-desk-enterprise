import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import { Card, CardHeader } from "@/components/ui/card";
import type { RoutingChangeLogEntry } from "@/services/routing-api";

interface RoutingChangeLogPanelProperties {
  readonly entries: readonly RoutingChangeLogEntry[];
}

export function RoutingChangeLogPanel({ entries }: RoutingChangeLogPanelProperties) {
  const { t, i18n } = useTranslation();
  if (entries.length === 0) {
    return (
      <EmptyState
        title={t("routing.changeLogEmptyTitle")}
        body={t("routing.changeLogEmptyBody")}
      />
    );
  }
  return (
    <Card>
      <CardHeader
        title={t("routing.changeLogHeading")}
        subtitle={t("routing.changeLogSubtitle")}
      />
      <ul className="divide-y divide-border/50">
        {entries.map((entry) => (
          <li key={entry.id} className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral" dot={false} className="tnum">
                {entry.diff.action} · {entry.entityType}
              </Badge>
              <span className="text-[11.5px] text-muted">
                {entry.actorDisplayName ??
                  entry.actorUserId ??
                  t("routing.changeUnknownActor")}{" "}
                · <RelativeTime value={entry.createdAt} locale={i18n.language} />
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] italic text-text/85">
              “{entry.reason}”
            </p>
            <div className={`${tableWrapClassName} mt-2 overflow-hidden rounded-md border border-border`}>
              <table className="w-full">
                <thead>
                  <tr className="bg-background/60 text-left">
                    <th className={`${tableHeadClassName} px-3 py-1.5`}>
                      {t("routing.changeField")}
                    </th>
                    <th className={`${tableHeadClassName} px-3 py-1.5`}>
                      {t("routing.changeBefore")}
                    </th>
                    <th className={`${tableHeadClassName} px-3 py-1.5`}>
                      {t("routing.changeAfter")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {entry.diff.changes.length === 0 ? (
                    <tr className={tableRowClassName}>
                      <td className="px-3 py-1.5 text-[11.5px] text-muted" colSpan={3}>
                        {entry.diff.action}
                      </td>
                    </tr>
                  ) : (
                    entry.diff.changes.map((change) => (
                      <tr key={`${entry.id}-${change.path}`}>
                        <td className="px-3 py-1.5 text-[11.5px] text-muted">
                          {change.path}
                        </td>
                        <td className="px-3 py-1.5 text-[11.5px] text-danger/85 line-through decoration-danger/40 tnum">
                          {stringifyChange(change.before)}
                        </td>
                        <td className="px-3 py-1.5 text-[11.5px] text-[#4ADE80] tnum">
                          {stringifyChange(change.after)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function stringifyChange(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}
