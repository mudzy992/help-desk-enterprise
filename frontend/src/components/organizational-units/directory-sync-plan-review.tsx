import { AlertTriangle, Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { UnderlineTabs } from "@/components/ui/tabs";
import { downloadDirectoryPlanCsv } from "@/lib/directory/directory-sync-plan-csv";
import type { DirectorySyncPlan } from "@/services/directory-sync-api";

/*
  Paket 1.8 (A4): read-only review of a dry-run plan. Large plans render the
  first ROW_LIMIT rows per tab; the CSV always contains everything.
*/

const ROW_LIMIT = 200;

type PlanTab = "units" | "users" | "deactivate" | "roles" | "exceptions";

type PlanRow = {
  readonly key: string;
  readonly action: string;
  readonly primary: string;
  readonly secondary: string | null;
  readonly target: string | null;
  readonly detail: string | null;
  readonly tone: "success" | "info" | "warning" | "danger" | "neutral";
};

interface DirectorySyncPlanReviewProperties {
  readonly runId: string;
  readonly plan: DirectorySyncPlan;
  readonly footer?: ReactNode;
}

export function DirectorySyncPlanReview({ runId, plan, footer }: DirectorySyncPlanReviewProperties) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PlanTab>("users");

  const actionLabel = (action: string): string => {
    switch (action) {
      case "create":
        return t("directory.ldaps.plan.actionCreate");
      case "update":
        return t("directory.ldaps.plan.actionUpdate");
      case "reactivate":
        return t("directory.ldaps.plan.actionReactivate");
      case "deactivate":
        return t("directory.ldaps.plan.actionDeactivate");
      case "grant":
        return t("directory.ldaps.plan.actionGrant");
      case "revoke":
        return t("directory.ldaps.plan.actionRevoke");
      default:
        return action;
    }
  };

  const rowsByTab: Record<PlanTab, readonly PlanRow[]> = {
    units: [
      ...plan.organizationalUnits.create.map((unit): PlanRow => ({
        key: `c:${unit.distinguishedName}`, action: "create", primary: unit.name, secondary: null,
        target: unit.path, detail: unit.distinguishedName, tone: "success",
      })),
      ...plan.organizationalUnits.update.map((unit): PlanRow => ({
        key: `u:${unit.distinguishedName}`, action: "update", primary: unit.name, secondary: null,
        target: unit.path, detail: (unit.changes ?? []).join(", "), tone: "info",
      })),
    ],
    users: [
      ...plan.users.create.map((user): PlanRow => ({
        key: `c:${user.guid}`, action: "create", primary: user.displayName, secondary: user.email,
        target: user.ouPath, detail: user.department, tone: "success",
      })),
      ...plan.users.reactivate.map((user): PlanRow => ({
        key: `r:${user.guid}`, action: "reactivate", primary: user.displayName, secondary: user.email,
        target: user.ouPath, detail: (user.changes ?? []).join(", "), tone: "info",
      })),
      ...plan.users.update.map((user): PlanRow => ({
        key: `u:${user.guid}`, action: "update", primary: user.displayName, secondary: user.email,
        target: user.ouPath, detail: (user.changes ?? []).join(", "), tone: "neutral",
      })),
    ],
    deactivate: plan.users.deactivate.map((user): PlanRow => ({
      key: user.userId, action: "deactivate", primary: user.displayName, secondary: user.email,
      target: null,
      detail: user.reason === "disabled"
        ? t("directory.ldaps.plan.reasonDisabled")
        : t("directory.ldaps.plan.reasonMissing"),
      tone: "danger",
    })),
    roles: [
      ...plan.roles.grant.map((grant): PlanRow => ({
        key: `g:${grant.email}:${grant.roleKey}:${grant.ouPath}`, action: "grant", primary: grant.email,
        secondary: null, target: `${grant.roleKey} · ${grant.ouPath}`, detail: null, tone: "success",
      })),
      ...plan.roles.revoke.map((revoke): PlanRow => ({
        key: `r:${revoke.userRoleId}`, action: "revoke", primary: revoke.email, secondary: null,
        target: revoke.roleKey, detail: null, tone: "warning",
      })),
    ],
    exceptions: plan.exceptions.map((exception, index): PlanRow => ({
      key: `e:${index}`, action: exception.code, primary: exception.email ?? "—", secondary: null,
      target: exception.distinguishedName, detail: exception.detail, tone: "warning",
    })),
  };

  const rows = rowsByTab[tab];
  const visible = rows.slice(0, ROW_LIMIT);
  const { safeguard } = plan;

  const stats: readonly { readonly label: string; readonly value: number }[] = [
    { label: t("directory.ldaps.plan.statDirectoryUsers"), value: plan.totals.directoryUsers },
    { label: t("directory.ldaps.plan.statCreate"), value: plan.users.create.length },
    { label: t("directory.ldaps.plan.statUpdate"), value: plan.users.update.length + plan.users.reactivate.length },
    { label: t("directory.ldaps.plan.statDeactivate"), value: plan.users.deactivate.length },
    { label: t("directory.ldaps.plan.statUnchanged"), value: plan.users.unchanged },
    { label: t("directory.ldaps.plan.statExceptions"), value: plan.exceptions.length },
  ];

  return (
    <div className="space-y-3" data-testid="directory-sync-plan">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-border/70 bg-elevated/40 px-3 py-2">
            <dt className="text-[11px] text-muted-foreground">{stat.label}</dt>
            <dd className="tnum text-[16px] font-semibold text-foreground">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <p
        role={safeguard.tripped ? "alert" : undefined}
        className={
          safeguard.tripped
            ? "flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-foreground"
            : "text-[11.5px] text-muted-foreground"
        }
      >
        {safeguard.tripped ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" /> : null}
        <span>
          {t(safeguard.tripped ? "directory.ldaps.plan.safeguardTripped" : "directory.ldaps.plan.safeguardOk", {
            deactivations: safeguard.deactivations,
            active: safeguard.activeManagedUsers,
            percent: safeguard.percent.toFixed(1),
            limit: safeguard.limitPercent,
          })}
        </span>
      </p>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <UnderlineTabs
          className="min-w-0 flex-1"
          active={tab}
          onChange={(key) => setTab(key as PlanTab)}
          items={[
            { key: "users", label: t("directory.ldaps.plan.tabUsers"), count: rowsByTab.users.length },
            { key: "deactivate", label: t("directory.ldaps.plan.tabDeactivate"), count: rowsByTab.deactivate.length },
            { key: "units", label: t("directory.ldaps.plan.tabUnits"), count: rowsByTab.units.length },
            { key: "roles", label: t("directory.ldaps.plan.tabRoles"), count: rowsByTab.roles.length },
            { key: "exceptions", label: t("directory.ldaps.plan.tabExceptions"), count: rowsByTab.exceptions.length },
          ]}
        />
        <Button variant="outline" size="xs" onClick={() => downloadDirectoryPlanCsv(plan, runId)}>
          <Download size={12} /> {t("directory.ldaps.plan.downloadCsv")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="px-1 py-3 text-[12px] text-muted-foreground">{t("directory.ldaps.plan.emptyTab")}</p>
      ) : (
        <div className={tableWrapClassName}>
          <table className="w-full min-w-[680px] text-left text-[12.5px]">
            <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
              <tr>
                <th className="px-3 py-2">{t("directory.ldaps.plan.columnAction")}</th>
                <th className="px-3 py-2">{t("directory.ldaps.plan.columnSubject")}</th>
                <th className="px-3 py-2">{t("directory.ldaps.plan.columnTarget")}</th>
                <th className="px-3 py-2">{t("directory.ldaps.plan.columnDetail")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.key} className={tableRowClassName}>
                  <td className="whitespace-nowrap px-3">
                    <Badge tone={row.tone} dot={false}>
                      {tab === "exceptions" ? row.action : actionLabel(row.action)}
                    </Badge>
                  </td>
                  <td className="max-w-[260px] px-3">
                    <p className="truncate text-foreground">{row.primary}</p>
                    {row.secondary ? (
                      <p className="truncate text-[11.5px] text-muted-foreground">{row.secondary}</p>
                    ) : null}
                  </td>
                  <td className="max-w-[240px] truncate px-3 text-muted-foreground">{row.target ?? "—"}</td>
                  <td className="max-w-[280px] truncate px-3 text-[12px] text-muted-foreground">
                    {row.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > ROW_LIMIT ? (
            <p className="border-t border-border/70 px-3 py-2 text-[11.5px] text-muted-foreground">
              {t("directory.ldaps.plan.truncated", { shown: ROW_LIMIT, total: rows.length })}
            </p>
          ) : null}
        </div>
      )}
      {footer}
    </div>
  );
}
