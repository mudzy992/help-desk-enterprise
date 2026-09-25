import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/ui/card";
import type { TicketWorkflowResponse } from "@/services/workflow-api";

type Row = { readonly label: string; readonly value: string; readonly alert?: boolean };

/** Paket 1.7 (W2): the settings that parametrise the guards, as they are now. */
export function WorkflowParametersCard({
  parameters,
}: {
  readonly parameters: TicketWorkflowResponse["parameters"];
}) {
  const { t } = useTranslation();
  const onOff = (value: boolean | undefined) => (value === true ? t("workflow.on") : t("workflow.off"));
  const unavailable = t("workflow.unavailable");
  const { unrouted } = parameters;
  const rows: readonly Row[] = [
    {
      label: t("workflow.params.closeCodes"),
      value: parameters.closeCodes
        ? `${onOff(parameters.closeCodes.enabled)} · ${t("workflow.params.requiredOnResolve")}: ${onOff(parameters.closeCodes.requireOnResolve)}`
        : unavailable,
    },
    {
      label: t("workflow.params.requiredFields"),
      value: parameters.requiredFields
        ? `${onOff(parameters.requiredFields.enabled)} · ${t("workflow.params.globalFields", { count: parameters.requiredFields.globalCount })}`
        : unavailable,
    },
    {
      label: t("workflow.params.reopen"),
      value: parameters.reopen
        ? `${onOff(parameters.reopen.enabled)} · ${t("workflow.params.days", { count: parameters.reopen.windowDays })}`
        : unavailable,
    },
    {
      label: t("workflow.params.waitingForUser"),
      value: parameters.waitingForUser
        ? `${onOff(parameters.waitingForUser.enabled)} · ${t("workflow.params.waitingValues", {
            reminder: parameters.waitingForUser.reminderAfterDays,
            close: parameters.waitingForUser.autoCloseAfterDays,
          })}`
        : unavailable,
    },
    {
      label: t("workflow.params.approvals"),
      value: parameters.approvals ? onOff(parameters.approvals.enabled) : unavailable,
    },
    {
      label: t("workflow.params.archive"),
      value: parameters.archive
        ? `${onOff(parameters.archive.enabled)} · ${t("workflow.params.days", { count: parameters.archive.afterClosedDays })}`
        : unavailable,
    },
    { label: t("workflow.params.unroutedOwner"), value: unrouted.ownerRole },
    {
      label: t("workflow.params.unroutedTarget"),
      value: unrouted.targetGroupMissing
        ? t("workflow.params.targetMissing")
        : (unrouted.targetGroup?.name ?? t("workflow.params.targetNone")),
      alert: unrouted.targetGroupMissing,
    },
    {
      label: t("workflow.params.unroutedCleanup"),
      value:
        unrouted.cleanupSlaHours === 0
          ? t("workflow.off")
          : `${t("workflow.params.hours", { count: unrouted.cleanupSlaHours })} · ${t("workflow.params.digest")}: ${onOff(unrouted.weeklyDigest)}`,
    },
  ];
  return (
    <Card className="fade-in h-fit">
      <CardHeader title={t("workflow.paramsTitle")} subtitle={t("workflow.paramsSubtitle")} />
      <dl className="divide-y divide-border/40 px-4 py-1.5 text-[12px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 py-2.5">
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
            <dd className={row.alert ? "text-right font-medium text-danger" : "text-right text-foreground/90"}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-border/40 px-4 py-3 text-[11.5px] text-muted-foreground">
        {t("workflow.paramsHint")}{" "}
        <Link className="text-link underline-offset-2 hover:underline" to="/admin?tab=settings">
          {t("workflow.paramsLink")}
        </Link>
      </p>
    </Card>
  );
}
