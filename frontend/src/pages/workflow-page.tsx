import { GitFork, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { WorkflowDiagram } from "@/components/workflow/workflow-diagram";
import { WorkflowParametersCard } from "@/components/workflow/workflow-parameters-card";
import { WorkflowTransitionsTable } from "@/components/workflow/workflow-transitions-table";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, brandCrumb } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { getTicketCounts } from "@/services/tickets-counts-api";
import type { TicketStatus } from "@/services/tickets-api";
import { getTicketWorkflow, type TicketWorkflowResponse } from "@/services/workflow-api";

/** Read-only status flow, transition table, and live guard parameters for administrators. */
export function WorkflowPage() {
  const { t } = useTranslation();
  const [workflow, setWorkflow] = useState<TicketWorkflowResponse | null>(null);
  const [counts, setCounts] = useState<Readonly<Partial<Record<TicketStatus, number>>>>({});
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [countsError, setCountsError] = useState(false);
  const [workflowRequest, setWorkflowRequest] = useState(0);
  const [countsRequest, setCountsRequest] = useState(0);
  const [selected, setSelected] = useState<TicketStatus | null>(null);

  useEffect(() => {
    let active = true;
    setErrorKey(null);
    setRequestId(null);
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
    return () => {
      active = false;
    };
  }, [workflowRequest]);

  useEffect(() => {
    let active = true;
    setCountsError(false);
    getTicketCounts()
      .then((response) => {
        if (active) setCounts(response.byStatus);
      })
      .catch(() => {
        if (active) setCountsError(true);
      });
    return () => {
      active = false;
    };
  }, [countsRequest]);

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
        crumbs={[brandCrumb, t("navigation.sections.administration"), t("workflow.title")]}
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
        <div className="space-y-2">
          <ApiErrorText messageKey={errorKey} requestId={requestId} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setWorkflowRequest((value) => value + 1)}
          >
            {t("workflow.retry")}
          </Button>
        </div>
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
              {countsError ? (
                <p
                  role="alert"
                  className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-md border border-warning/35 bg-warning/8 px-3 py-2 text-[12px]"
                >
                  <span>{t("workflow.countsError")}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setCountsRequest((value) => value + 1)}
                  >
                    {t("workflow.retry")}
                  </Button>
                </p>
              ) : null}
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
