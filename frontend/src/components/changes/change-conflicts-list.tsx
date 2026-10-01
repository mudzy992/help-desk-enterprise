import { AlertTriangle, Snowflake } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { changeStatusKeys, changeStatusTone, formatChangeWindow } from "@/lib/changes/change-view";
import type { ChangeConflicts } from "@/services/changes-api";

/**
 * Paket 3.4 (§9): overlapping changes, downtime windows and a freeze. A
 * blocking freeze is an error; everything else is a warning to acknowledge.
 */
export function ChangeConflictsList({ conflicts }: { readonly conflicts: ChangeConflicts }) {
  const { t, i18n } = useTranslation();
  const freeze = conflicts.freeze;
  return (
    <div className="grid gap-2 text-[12.5px]" data-testid="change-conflicts">
      {freeze !== null ? (
        <div
          role={conflicts.freezeBlocks ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-foreground ${conflicts.freezeBlocks ? "border-danger/40 bg-danger/10" : "border-warning/40 bg-warning/10"}`}
        >
          <Snowflake size={16} className={`mt-0.5 shrink-0 ${conflicts.freezeBlocks ? "text-danger" : "text-warning"}`} aria-hidden="true" />
          <span>
            {t(conflicts.freezeBlocks ? "changes.conflicts.freezeBlocks" : "changes.conflicts.freezeWarns", {
              label: freeze.label || t("changes.conflicts.freezeUnnamed"),
              from: freeze.from,
              to: freeze.to,
            })}
          </span>
        </div>
      ) : null}
      {conflicts.changes.length > 0 ? (
        <div className="grid gap-1">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <AlertTriangle size={14} className="text-warning" aria-hidden="true" />
            {t("changes.conflicts.changesTitle", { count: conflicts.changes.length })}
          </p>
          <ul className="grid gap-1">
            {conflicts.changes.map((item) => (
              <li key={item.id} className="rounded-md border border-border px-3 py-1.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Link to={`/changes/${item.id}`} className="tnum font-medium text-link hover:underline">
                    {item.number}
                  </Link>
                  <span className="min-w-0 truncate text-foreground">{item.title}</span>
                  <Badge tone={changeStatusTone(item.status)}>{t(changeStatusKeys[item.status])}</Badge>
                </span>
                <span className="block text-[11.5px] text-muted-foreground">
                  {formatChangeWindow(item.plannedStart, item.plannedEnd, i18n.language)}
                  {item.sharedServices.length > 0 ? ` · ${item.sharedServices.map((service) => service.name).join(", ")}` : ""}
                  {item.sharedAssetCount > 0 ? ` · ${t("changes.conflicts.sharedAssets", { count: item.sharedAssetCount })}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {conflicts.downtime.length > 0 ? (
        <div className="grid gap-1">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <AlertTriangle size={14} className="text-warning" aria-hidden="true" />
            {t("changes.conflicts.downtimeTitle", { count: conflicts.downtime.length })}
          </p>
          <ul className="grid gap-1">
            {conflicts.downtime.map((item) => (
              <li key={item.id} className="rounded-md border border-border px-3 py-1.5">
                <span className="block text-foreground">{item.service.name}</span>
                <span className="block text-[11.5px] text-muted-foreground">
                  {formatChangeWindow(item.startsAt, item.endsAt, i18n.language)}
                  {item.message ? ` · ${item.message}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {freeze === null && conflicts.changes.length === 0 && conflicts.downtime.length === 0 ? (
        <p className="text-muted-foreground">{t("changes.conflicts.none")}</p>
      ) : null}
    </div>
  );
}
