import { AlarmClock, Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { tableHeadClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { countSlaPriorityExposure } from "@/lib/sla/count-sla-profile-exposure";
import { slaPriorityLabelKey } from "@/lib/sla/sla-form-defaults";
import { formatHours, formatMinutes } from "@/lib/reports/report-format";
import { TICKET_PRIORITY_META } from "@/lib/theme/semantic-meta";
import type { SlaRule } from "@/services/sla-types";
import type { TicketPriority, TicketResponse } from "@/services/tickets-api";

interface SlaPriorityTargetsTableProperties {
  readonly rules: readonly SlaRule[];
  readonly tickets: readonly TicketResponse[];
  readonly slaProfileId: string;
  readonly calendarLabel: string;
}

function formatTargetMinutes(minutes: number, locale: string): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    return formatHours(minutes / 60, locale);
  }
  return formatMinutes(minutes, locale);
}

export function SlaPriorityTargetsTable({
  rules,
  tickets,
  slaProfileId,
  calendarLabel,
}: SlaPriorityTargetsTableProperties) {
  const { t, i18n } = useTranslation();

  if (rules.length === 0) {
    return (
      <EmptyState
        title={t("sla.rulesEmptyTitle")}
        body={t("sla.rulesEmptyBody")}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead>
          <tr className="border-b border-border/70 text-left">
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.priority")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.firstResponse")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.resolution")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.measurement")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5 text-right`}>
              {t("sla.currentlyExposed")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rules.map((rule) => {
            const priority = rule.priority as TicketPriority;
            const exposure = countSlaPriorityExposure(tickets, slaProfileId, priority);
            return (
              <tr key={rule.id} className="transition-colors hover:bg-elevated/40">
                <td className="px-4 py-3">
                  <Badge tone={TICKET_PRIORITY_META[priority].tone} dot>
                    {t(slaPriorityLabelKey(priority))}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-[12.5px] text-text tnum">
                    <Clock3 size={12.5} className="text-muted" />
                    {formatTargetMinutes(rule.responseMinutes, i18n.language)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-[12.5px] text-text tnum">
                    <AlarmClock size={12.5} className="text-muted" />
                    {formatTargetMinutes(rule.resolutionMinutes, i18n.language)}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11.5px] text-muted">{calendarLabel}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <span className="tnum text-[12.5px] font-medium text-text">
                      {exposure.open}
                    </span>
                    {exposure.atRisk > 0 ? (
                      <Badge tone="warning" dot={false}>
                        {t("sla.exposedAtRisk", { count: exposure.atRisk })}
                      </Badge>
                    ) : null}
                    {exposure.breached > 0 ? (
                      <Badge tone="danger" dot={false}>
                        {t("sla.exposedBreached", { count: exposure.breached })}
                      </Badge>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
