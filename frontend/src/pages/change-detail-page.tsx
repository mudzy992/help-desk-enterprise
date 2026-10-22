import {
  ChangeLinks,
  ChangeOverview,
  ChangePlan,
} from "@/components/changes/change-detail-sections";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GitPullRequestArrow, MoreHorizontal, Pencil, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ChangeActionSheet } from "@/components/changes/change-action-sheet";
import { ChangeApprovalsPanel } from "@/components/changes/change-approvals-panel";
import { ChangeFormSheet } from "@/components/changes/change-form-sheet";
import { ChangeHistoryPanel } from "@/components/changes/change-history-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityDetailQueryError } from "@/components/entity-list/entity-detail-query-error";
import { PageHeader } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  changeActionKeys,
  changeRiskKeys,
  changeRiskTone,
  changeTypeKeys,
  changeStatusKeys,
  changeStatusTone,
  changeTypeTone,
  mapChangeError,
  primaryChangeAction,
} from "@/lib/changes/change-view";
import {
  entityMutationQueryKeys,
  invalidateEntityQueries,
} from "@/lib/entity-list/entity-mutation-query-keys";
import { useEntityMutation } from "@/lib/entity-list/use-entity-mutation";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
import { resolveEntityDetailState } from "@/lib/entity-list/resolve-entity-detail-state";
import {
  changeQueryKeys,
  claimChange,
  getChange,
  getChangeCapabilities,
  getChangeOptions,
  type ChangeAction,
  type ChangeDetail,
} from "@/services/changes-api";

type Tab = "overview" | "plan" | "approvals" | "links" | "history";

/** Delivery invariant (requirement): change record with overview, plan, CAB approval, links and history. */
export function ChangeDetailPage() {
  const { t } = useTranslation();
  const { changeId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [action, setAction] = useState<ChangeAction | null>(null);

  const changeQuery = useQuery({
    queryKey: changeQueryKeys.detail(changeId),
    queryFn: () => getChange(changeId),
    retry: false,
    enabled: changeId !== "",
  });
  const capabilitiesQuery = useQuery({
    queryKey: changeQueryKeys.capabilities,
    queryFn: getChangeCapabilities,
    retry: false,
  });
  const canEdit = changeQuery.data?.permissions.canEdit === true;
  const optionsQuery = useQuery({
    queryKey: changeQueryKeys.options,
    queryFn: getChangeOptions,
    retry: false,
    enabled: canEdit,
  });

  const refresh = () =>
    void invalidateEntityQueries(queryClient, entityMutationQueryKeys.changes.record(changeId));
  const claimMutation = useEntityMutation<void, ChangeDetail>({
    mutationFn: () => claimChange(changeId),
    invalidate: () => entityMutationQueryKeys.changes.record(changeId),
    onSuccess: (_variables, next) => {
      queryClient.setQueryData(changeQueryKeys.detail(changeId), next);
      toast({ tone: "success", title: t("changes.detail.claimed") });
    },
    onError: (caught) =>
      toast({
        tone: "danger",
        title: t(mapChangeError(caught) ?? mapApiError(caught)),
        error: caught,
      }),
  });
  const crumbs = [t("navigation.sections.tickets"), t("changes.title")];
  const back = (
    <Button variant="ghost" size="sm" onClick={() => navigate("/changes")}>
      <ArrowLeft size={14} aria-hidden="true" />
      {t("changes.detail.back")}
    </Button>
  );

  const detailState = resolveEntityDetailState({
    isLoading: changeQuery.isLoading,
    hasData: changeQuery.data !== undefined,
    error: changeQuery.error,
  });
  if (detailState === "loading") {
    return (
      <section>
        <PageHeader crumbs={crumbs} title={t("changes.title")} />
        <PanelSkeleton label={t("ui.loading")} />
      </section>
    );
  }
  if (detailState === "error") {
    return (
      <section className="grid gap-4">
        <PageHeader crumbs={crumbs} title={t("changes.title")} actions={back} />
        <EntityDetailQueryError
          messageKey={mapChangeError(changeQuery.error) ?? mapApiError(changeQuery.error)}
          requestId={readApiRequestId(changeQuery.error)}
          retrying={changeQuery.isFetching}
          onRetry={() => void changeQuery.refetch()}
        />
      </section>
    );
  }
  if (detailState === "not_found" || changeQuery.data === undefined) {
    return (
      <section>
        <PageHeader crumbs={crumbs} title={t("changes.title")} actions={back} />
        <EmptyState
          icon={<GitPullRequestArrow size={18} />}
          title={t("changes.detail.notFoundTitle")}
          body={t("changes.errors.notFound")}
        />
      </section>
    );
  }

  const change = changeQuery.data;
  const supportingError = capabilitiesQuery.error ?? optionsQuery.error;
  const primary = primaryChangeAction(change.allowedActions);
  const secondary = change.allowedActions.filter((item) => item !== primary);
  const applyNext = (next: ChangeDetail) => {
    queryClient.setQueryData(changeQueryKeys.detail(change.id), next);
    toast({ tone: "success", title: t("changes.actionSheet.done") });
    refresh();
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      {back}
      {canEdit ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
          disabled={optionsQuery.data === undefined || capabilitiesQuery.data === undefined}
          data-testid="change-edit"
        >
          <Pencil size={14} aria-hidden="true" />
          {change.permissions.editScope === "window"
            ? t("changes.detail.reschedule")
            : t("changes.detail.edit")}
        </Button>
      ) : null}
      {change.permissions.canClaim ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => claimMutation.mutate()}
          disabled={claimMutation.isPending}
          data-testid="change-claim"
        >
          <UserCheck size={14} aria-hidden="true" />
          {t("changes.detail.claim")}
        </Button>
      ) : null}
      {secondary.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid="change-more-actions">
              <MoreHorizontal size={14} aria-hidden="true" />
              {t("changes.detail.moreActions")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {secondary.map((item) => (
              <DropdownMenuItem
                key={item}
                onSelect={() => setAction(item)}
                data-testid={`change-action-${item}`}
              >
                {t(changeActionKeys[item])}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {primary !== undefined ? (
        <Button
          variant="primary"
          size="sm"
          onClick={() => setAction(primary)}
          data-testid={`change-action-${primary}`}
        >
          {t(changeActionKeys[primary])}
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
            {change.number} · {change.title}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={changeStatusTone(change.status)}>
              {t(changeStatusKeys[change.status])}
            </Badge>
            <Badge tone={changeTypeTone(change.type)}>{t(changeTypeKeys[change.type])}</Badge>
            <Badge tone={changeRiskTone(change.risk)}>
              {t("changes.detail.riskLine", { risk: t(changeRiskKeys[change.risk]) })}
            </Badge>
            <span aria-hidden="true">·</span>
            <span>{change.organizationalUnit.name}</span>
          </span>
        }
        actions={actions}
      />
      {changeQuery.error !== null ? (
        <EntityDetailQueryError
          messageKey={mapChangeError(changeQuery.error) ?? mapApiError(changeQuery.error)}
          requestId={readApiRequestId(changeQuery.error)}
          retrying={changeQuery.isFetching}
          onRetry={() => void changeQuery.refetch()}
        />
      ) : null}
      {supportingError !== null ? (
        <EntityDetailQueryError
          messageKey={mapChangeError(supportingError) ?? mapApiError(supportingError)}
          requestId={readApiRequestId(supportingError)}
          retrying={capabilitiesQuery.isFetching || optionsQuery.isFetching}
          onRetry={() => void Promise.all([capabilitiesQuery.refetch(), optionsQuery.refetch()])}
        />
      ) : null}
      <div className="grid gap-4">
        <UnderlineTabs
          items={[
            { key: "overview", label: t("changes.detail.tabs.overview") },
            { key: "plan", label: t("changes.detail.tabs.plan") },
            { key: "approvals", label: t("changes.detail.tabs.approvals") },
            {
              key: "links",
              label: t("changes.detail.tabs.links"),
              count: change.serviceCount + change.assetCount + (change.problem ? 1 : 0),
            },
            { key: "history", label: t("changes.detail.tabs.history") },
          ]}
          active={tab}
          onChange={(key) => setTab(key as Tab)}
        />
        {tab === "overview" ? <ChangeOverview change={change} /> : null}
        {tab === "plan" ? <ChangePlan change={change} /> : null}
        {tab === "approvals" ? (
          <ChangeApprovalsPanel
            change={change}
            onVoted={() => {
              toast({ tone: "success", title: t("changes.approvals.recorded") });
              refresh();
            }}
          />
        ) : null}
        {tab === "links" ? <ChangeLinks change={change} /> : null}
        {tab === "history" ? (
          <ChangeHistoryPanel changeId={change.id} versionKey={change.version} />
        ) : null}
      </div>
      {optionsQuery.data && capabilitiesQuery.data && canEdit ? (
        <ChangeFormSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          options={optionsQuery.data}
          capabilities={capabilitiesQuery.data}
          change={change}
          onSaved={() => {
            toast({ tone: "success", title: t("changes.form.saved") });
            refresh();
          }}
        />
      ) : null}
      <ChangeActionSheet
        action={action}
        change={change}
        onClose={() => setAction(null)}
        onDone={applyNext}
      />
    </section>
  );
}
