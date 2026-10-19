import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/ui/card";
import type { TicketWorkflowResponse } from "@/services/workflow-api";
import type { TranslationKey } from "@/i18n/translation-key";

const ownerRoleKeys: Readonly<Record<string, TranslationKey>> = {
  USER: "shell.roles.user",
  AGENT: "shell.roles.agent",
  ADMIN: "shell.roles.admin",
  SUPER_ADMIN: "shell.roles.superAdmin",
};

type Row = { readonly label: string; readonly value: string; readonly alert?: boolean };

/** Live settings that parameterize the read-only workflow guards. */
export function WorkflowParametersCard({
  parameters,
}: {
  readonly parameters: TicketWorkflowResponse["parameters"];
}) {
  const { t } = useTranslation();
  const onOff = (value: boolean | undefined) =>
    value === true ? t("workflow.on") : t("workflow.off");
  const unavailable = t("workflow.unavailable");
  const { unrouted } = parameters;
  const rows: readonly Row[] = [
    {
      label: t("workflow.params.closeCodes"),
      value: parameters.closeCodes
        ? t("workflow.params.closeCodesValue", {
            state: onOff(parameters.closeCodes.enabled),
            required: onOff(parameters.closeCodes.requireOnResolve),
          })
        : unavailable,
    },
    {
      label: t("workflow.params.requiredFields"),
      value: parameters.requiredFields
        ? t("workflow.params.requiredFieldsValue", {
            state: onOff(parameters.requiredFields.enabled),
            fields: t("workflow.params.globalFields", {
              count: parameters.requiredFields.globalCount,
            }),
          })
        : unavailable,
    },
    {
      label: t("workflow.params.reopen"),
      value: parameters.reopen
        ? t("workflow.params.reopenValue", {
            state: onOff(parameters.reopen.enabled),
            days: t("workflow.params.days", { count: parameters.reopen.windowDays }),
          })
        : unavailable,
    },
    {
      label: t("workflow.params.waitingForUser"),
      value: parameters.waitingForUser
        ? t("workflow.params.waitingValue", {
            state: onOff(parameters.waitingForUser.enabled),
            reminder: parameters.waitingForUser.reminderAfterDays,
            close: parameters.waitingForUser.autoCloseAfterDays,
          })
        : unavailable,
    },
    {
      label: t("workflow.params.approvals"),
      value: parameters.approvals ? onOff(parameters.approvals.enabled) : unavailable,
    },
    {
      label: t("workflow.params.archive"),
      value: parameters.archive
        ? t("workflow.params.archiveValue", {
            state: onOff(parameters.archive.enabled),
            days: t("workflow.params.days", { count: parameters.archive.afterClosedDays }),
          })
        : unavailable,
    },
    {
      label: t("workflow.params.unroutedOwner"),
      value: ownerRoleKeys[unrouted.ownerRole]
        ? t(ownerRoleKeys[unrouted.ownerRole])
        : unrouted.ownerRole,
    },
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
          : t("workflow.params.cleanupValue", {
              hours: t("workflow.params.hours", { count: unrouted.cleanupSlaHours }),
              digest: onOff(unrouted.weeklyDigest),
            }),
    },
  ];
  return (
    <Card className="fade-in h-fit">
      <CardHeader title={t("workflow.paramsTitle")} subtitle={t("workflow.paramsSubtitle")} />
      <dl className="divide-y divide-border/40 px-4 py-1.5 text-[12px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 py-2.5">
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
            <dd
              className={
                row.alert ? "text-right font-medium text-danger" : "text-right text-foreground/90"
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-border/40 px-4 py-3 text-[11.5px] text-muted-foreground">
        {t("workflow.paramsHint")}{" "}
        <Link
          className="text-link underline underline-offset-2 hover:decoration-2"
          to="/admin?tab=settings"
        >
          {t("workflow.paramsLink")}
        </Link>
      </p>
    </Card>
  );
}
