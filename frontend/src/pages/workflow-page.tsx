import { GitFork, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { WorkflowDiagram } from "@/components/workflow/workflow-diagram";
import { WorkflowParametersCard } from "@/components/workflow/workflow-parameters-card";
import { WorkflowTransitionsTable } from "@/components/workflow/workflow-transitions-table";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { getTicketCounts } from "@/services/tickets-counts-api";
import type { TicketStatus } from "@/services/tickets-api";
import { getTicketWorkflow, type TicketWorkflowResponse } from "@/services/workflow-api";

/**
 * Paket 1.7 (W3): read-only view of the ticket status flow of this
 * installation — diagram, transition table and the live guard parameters.
 * ADMIN and SUPER_ADMIN only; the flow is not editable from the UI (W4).
 */
export function WorkflowPage() {
  const { t } = useTranslation();
  const [workflow, setWorkflow] = useState<TicketWorkflowResponse | null>(null);
  const [counts, setCounts] = useState<Readonly<Partial<Record<TicketStatus, number>>>>({});
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [selected, setSelected] = useState<TicketStatus | null>(null);

  useEffect(() => {
    let active = true;
    getTicketWorkflow()
      .then((response) => {
        if (active) setWorkflow(response);
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorKey(mapApiError(error));
          setRequestId(readApiRequestId(error));
        }
      });
    getTicketCounts()
      .then((response) => {
        if (active) setCounts(response.byStatus);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const transitions = useMemo(
    () =>
      workflow === null
        ? []
        : selected === null
          ? workflow.transitions
          : workflow.transitions.filter((item) => item.from === selected || item.to === selected),
    [selected, workflow],
  );

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.sections.administration"), t("workflow.title")]}
        title={t("workflow.title")}
        subtitle={t("workflow.intro")}
      />
      <p
        role="note"
        className="mb-4 flex items-start gap-2 rounded-lg border border-info/35 bg-info/8 px-3 py-2.5 text-[12.5px] text-foreground"
      >
        <Info size={15} className="mt-0.5 shrink-0 text-info" />
        <span>{t("workflow.fixedNotice")}</span>
      </p>
      {errorKey !== null ? (
        <ApiErrorText messageKey={errorKey} requestId={requestId} />
      ) : workflow === null ? (
        <PanelSkeleton label={t("workflow.title")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="fade-in">
              <CardHeader
                title={
                  <span className="flex items-center gap-1.5">
                    <GitFork size={14} /> {t("workflow.diagramTitle")}
                  </span>
                }
                subtitle={t("workflow.diagramSubtitle")}
              />
              <WorkflowDiagram
                statuses={workflow.statuses}
                transitions={workflow.transitions}
                counts={counts}
                selected={selected}
                onSelect={setSelected}
              />
            </Card>
            <Card className="fade-in">
              <CardHeader title={t("workflow.tableTitle")} subtitle={t("workflow.tableSubtitle")} />
              <WorkflowTransitionsTable
                transitions={transitions}
                statuses={workflow.statuses.map((item) => item.status)}
                selected={selected}
                onSelect={setSelected}
                parameters={workflow.parameters}
              />
            </Card>
          </div>
          <WorkflowParametersCard parameters={workflow.parameters} />
        </div>
      )}
    </section>
  );
}
