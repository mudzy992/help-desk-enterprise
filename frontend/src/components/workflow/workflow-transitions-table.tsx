import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { selectCompactClassName, tableWrapClassName } from "@/components/ui/control";
import { workflowActorColor } from "@/components/workflow/workflow-actor-meta";
import { describeWorkflowGuard } from "@/lib/workflow/describe-workflow-guard";
import { ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import type { TicketStatus } from "@/services/tickets-api";
import type { TicketWorkflowResponse, WorkflowTransition } from "@/services/workflow-api";

interface WorkflowTransitionsTableProperties {
  readonly transitions: readonly WorkflowTransition[];
  readonly statuses: readonly TicketStatus[];
  readonly selected: TicketStatus | null;
  readonly onSelect: (status: TicketStatus | null) => void;
  readonly parameters: TicketWorkflowResponse["parameters"];
}

export function WorkflowTransitionsTable({
  transitions,
  statuses,
  selected,
  onSelect,
  parameters,
}: WorkflowTransitionsTableProperties) {
  const { t } = useTranslation();
  return (
    <div className="px-4 pb-4">
      <label className="mb-2.5 flex items-center gap-2 text-[12px] text-muted-foreground">
        {t("workflow.filterStatus")}
        <select
          className={`${selectCompactClassName} w-auto min-w-[10rem]`}
          value={selected ?? ""}
          data-testid="workflow-status-filter"
          onChange={(event) => onSelect(event.target.value === "" ? null : (event.target.value as TicketStatus))}
        >
          <option value="">{t("workflow.filterAll")}</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {t(ticketStatusLabelKey[status])}
            </option>
          ))}
        </select>
      </label>
      <div className={tableWrapClassName}>
        <table className="w-full text-left text-[12px]" data-testid="workflow-transitions-table">
          <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">{t("workflow.columns.from")}</th>
              <th className="px-3 py-2 font-semibold">{t("workflow.columns.to")}</th>
              <th className="px-3 py-2 font-semibold">{t("workflow.columns.actors")}</th>
              <th className="px-3 py-2 font-semibold">{t("workflow.columns.triggers")}</th>
              <th className="px-3 py-2 font-semibold">{t("workflow.columns.guards")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {transitions.map((transition) => (
              <tr key={`${transition.from}-${transition.to}`}>
                <td className="px-3 py-2 font-medium">{t(ticketStatusLabelKey[transition.from])}</td>
                <td className="px-3 py-2 font-medium">{t(ticketStatusLabelKey[transition.to])}</td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-x-2.5 gap-y-1">
                    {transition.actors.map((actor) => (
                      <span key={actor} className="flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ background: workflowActorColor[actor] }} />
                        {t(`workflow.actors.${actor}`)}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {transition.triggers.map((trigger) => t(`workflow.triggers.${trigger}`)).join(", ")}
                </td>
                <td className="px-3 py-2">
                  {transition.guards.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {transition.guards.map((guard) => {
                        const description = describeWorkflowGuard(guard, parameters);
                        return (
                          <Badge key={guard} tone={description.inactive ? "neutral" : "info"} dot={false}>
                            {t(description.key, description.values)}
                            {description.inactive ? ` · ${t("workflow.guardOff")}` : ""}
                          </Badge>
                        );
                      })}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
