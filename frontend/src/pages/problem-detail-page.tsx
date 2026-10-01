import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Pencil, Puzzle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ProblemAnalysisPanel } from "@/components/problems/problem-analysis-panel";
import { ProblemFormSheet } from "@/components/problems/problem-form-sheet";
import { ProblemHistoryPanel } from "@/components/problems/problem-history-panel";
import { ProblemStatusSheet } from "@/components/problems/problem-status-sheet";
import { ProblemTicketsPanel } from "@/components/problems/problem-tickets-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError, problemStatusKeys, problemStatusTone, rootCauseLabel, transitionLabelKey } from "@/lib/problems/problem-view";
import { ticketPriorityLabelKey, ticketSeverityLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { getProblem, getProblemOptions, problemDetailKeys, problemQueryKeys, type ProblemDetail, type ProblemStatus } from "@/services/problems-api";

type Tab = "overview" | "analysis" | "tickets" | "history";

/** Paket 3.3 (§14): problem record with overview, analysis, tickets and history. */
export function ProblemDetailPage() {
  const { t } = useTranslation();
  const { problemId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<ProblemStatus | null | "pick">(null);

  const problemQuery = useQuery({ queryKey: problemDetailKeys.detail(problemId), queryFn: () => getProblem(problemId), retry: false, enabled: problemId !== "" });
  const canManage = problemQuery.data?.permissions.canManage === true;
  const optionsQuery = useQuery({ queryKey: problemDetailKeys.options, queryFn: getProblemOptions, retry: false, enabled: problemQuery.data !== undefined });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: problemQueryKeys.all });
  const crumbs = [t("navigation.sections.tickets"), t("problems.title")];
  const back = (
    <Button variant="ghost" size="sm" onClick={() => navigate("/problems")}>
      <ArrowLeft size={14} aria-hidden="true" />
      {t("problems.detail.back")}
    </Button>
  );

  if (problemQuery.isLoading) {
    return (
      <section>
        <PageHeader crumbs={crumbs} title={t("problems.title")} />
        <PanelSkeleton label={t("ui.loading")} />
      </section>
    );
  }
  if (problemQuery.error || problemQuery.data === undefined) {
    return (
      <section>
        <PageHeader crumbs={crumbs} title={t("problems.title")} actions={back} />
        <EmptyState
          icon={<Puzzle size={18} />}
          title={t("problems.detail.notFoundTitle")}
          body={t(mapProblemError(problemQuery.error) ?? (problemQuery.error ? mapApiError(problemQuery.error) : "problems.errors.notFound"))}
        />
      </section>
    );
  }

  const problem = problemQuery.data;
  // The natural next step is the primary action; the rest sit in the status sheet.
  const nextStep = problem.allowedTransitions.find((to) => to !== "CANCELLED" && !(to === "INVESTIGATING" && problem.status !== "NEW"));

  const actions = (
    <div className="flex flex-wrap gap-2">
      {back}
      {canManage && problem.status !== "CLOSED" && problem.status !== "CANCELLED" ? (
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={optionsQuery.data === undefined} data-testid="problem-edit">
          <Pencil size={14} aria-hidden="true" />
          {t("problems.detail.edit")}
        </Button>
      ) : null}
      {problem.allowedTransitions.length > 0 ? (
        <Button variant="outline" size="sm" onClick={() => setStatusTarget("pick")} data-testid="problem-change-status">
          <RefreshCw size={14} aria-hidden="true" />
          {t("problems.detail.changeStatus")}
        </Button>
      ) : null}
      {nextStep !== undefined ? (
        <Button variant="primary" size="sm" onClick={() => setStatusTarget(nextStep)} data-testid="problem-next-step">
          {ticketText(t, transitionLabelKey(problem.status, nextStep))}
        </Button>
      ) : null}
    </div>
  );

  return (
    <section>
      <PageHeader
        crumbs={crumbs}
        title={
          <span>
            {problem.number} · {problem.title}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={problemStatusTone(problem.status)}>{t(problemStatusKeys[problem.status])}</Badge>
            <span>{t("problems.detail.priorityLine", { priority: ticketText(t, ticketPriorityLabelKey[problem.priority]) })}</span>
            <span aria-hidden="true">·</span>
            <span>{problem.organizationalUnit.name}</span>
          </span>
        }
        actions={actions}
      />
      <div className="grid gap-4">
        {problem.status === "NEW" && problem.owner === null && canManage ? (
          <div role="status" className="flex items-start gap-2 rounded-md border border-info/40 bg-info/10 px-3 py-2 text-[12.5px] text-foreground">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
            <span>{t("problems.detail.needsOwner")}</span>
          </div>
        ) : null}
        <UnderlineTabs
          items={[
            { key: "overview", label: t("problems.detail.tabs.overview") },
            { key: "analysis", label: t("problems.detail.tabs.analysis") },
            { key: "tickets", label: t("problems.detail.tabs.tickets"), count: problem.ticketCount },
            { key: "history", label: t("problems.detail.tabs.history") },
          ]}
          active={tab}
          onChange={(key) => setTab(key as Tab)}
        />
        {tab === "overview" ? <ProblemOverview problem={problem} /> : null}
        {tab === "analysis" ? (
          <ProblemAnalysisPanel
            problem={problem}
            categories={optionsQuery.data?.rootCauseCategories ?? []}
            onSaved={(next) => {
              queryClient.setQueryData(problemDetailKeys.detail(problem.id), next);
              refresh();
            }}
          />
        ) : null}
        {tab === "tickets" ? <ProblemTicketsPanel problem={problem} onChanged={refresh} /> : null}
        {tab === "history" ? <ProblemHistoryPanel problemId={problem.id} versionKey={problem.version} /> : null}
      </div>
      {optionsQuery.data && canManage ? (
        <ProblemFormSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          options={optionsQuery.data}
          problem={problem}
          onSaved={() => {
            toast({ tone: "success", title: t("problems.form.saved") });
            refresh();
          }}
        />
      ) : null}
      <ProblemStatusSheet
        open={statusTarget !== null}
        onOpenChange={(open) => (open ? undefined : setStatusTarget(null))}
        problem={problem}
        initialStatus={statusTarget !== null && statusTarget !== "pick" ? statusTarget : undefined}
        onDone={() => {
          toast({ tone: "success", title: t("problems.statusSheet.done") });
          refresh();
        }}
      />
    </section>
  );
}

function DefinitionRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(120px,40%)_1fr] gap-2 py-1.5 text-[12.5px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function ProblemOverview({ problem }: { readonly problem: ProblemDetail }) {
  const { t, i18n } = useTranslation();
  const date = (value: string | null) => (value === null ? "—" : formatAssetDateTime(value, i18n.language));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("problems.fields.description")} />
        <p className="whitespace-pre-wrap px-4 py-3 text-[12.5px] text-foreground">{problem.description}</p>
      </Card>
      <Card className="p-0">
        <CardHeader title={t("problems.detail.responsibility")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("problems.fields.owner")}>{problem.owner?.displayName ?? t("problems.list.noOwner")}</DefinitionRow>
          <DefinitionRow label={t("problems.fields.group")}>{problem.group?.name ?? "—"}</DefinitionRow>
          <DefinitionRow label={t("problems.fields.organizationalUnit")}>
            {problem.organizationalUnit.name}
            <span className="block text-[11.5px] text-muted-foreground">{problem.organizationalUnit.ouPath}</span>
          </DefinitionRow>
          <DefinitionRow label={t("problems.fields.service")}>{problem.service?.name ?? "—"}</DefinitionRow>
          <DefinitionRow label={t("problems.detail.createdBy")}>{problem.createdBy?.displayName ?? "—"}</DefinitionRow>
        </dl>
      </Card>
      <Card className="p-0">
        <CardHeader title={t("problems.detail.classification")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("problems.fields.impact")}>{ticketText(t, ticketSeverityLabelKey[problem.impact])}</DefinitionRow>
          <DefinitionRow label={t("problems.fields.urgency")}>{ticketText(t, ticketSeverityLabelKey[problem.urgency])}</DefinitionRow>
          <DefinitionRow label={t("problems.fields.priority")}>{ticketText(t, ticketPriorityLabelKey[problem.priority])}</DefinitionRow>
          <DefinitionRow label={t("problems.fields.rootCauseCategory")}>{rootCauseLabel((key) => ticketText(t, key), problem.rootCauseCategory)}</DefinitionRow>
          <DefinitionRow label={t("problems.detail.knowledgeArticle")}>
            {problem.knowledgeArticle ? (
              <Link to={`/knowledge-base/${problem.knowledgeArticle.id}`} className="text-link hover:underline">
                {problem.knowledgeArticle.title}
              </Link>
            ) : (
              "—"
            )}
          </DefinitionRow>
        </dl>
      </Card>
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("problems.detail.timeline")} />
        <dl className="grid divide-y divide-border/60 px-4 py-2 sm:grid-cols-2 sm:divide-y-0">
          <DefinitionRow label={t("problems.detail.createdAt")}>{date(problem.createdAt)}</DefinitionRow>
          <DefinitionRow label={t("problems.detail.identifiedAt")}>{date(problem.identifiedAt)}</DefinitionRow>
          <DefinitionRow label={t("problems.detail.resolvedAt")}>{date(problem.resolvedAt)}</DefinitionRow>
          <DefinitionRow label={t("problems.detail.closedAt")}>{date(problem.closedAt)}</DefinitionRow>
          {problem.cancelledAt ? <DefinitionRow label={t("problems.detail.cancelledAt")}>{date(problem.cancelledAt)}</DefinitionRow> : null}
          {problem.cancelReason ? <DefinitionRow label={t("problems.detail.cancelReason")}>{problem.cancelReason}</DefinitionRow> : null}
        </dl>
      </Card>
    </div>
  );
}
