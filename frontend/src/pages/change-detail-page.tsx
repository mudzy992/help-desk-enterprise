import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GitPullRequestArrow, MoreHorizontal, Pencil, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChangeActionSheet } from "@/components/changes/change-action-sheet";
import { ChangeApprovalsPanel } from "@/components/changes/change-approvals-panel";
import { ChangeConflictsList } from "@/components/changes/change-conflicts-list";
import { ChangeFormSheet } from "@/components/changes/change-form-sheet";
import { ChangeHistoryPanel } from "@/components/changes/change-history-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import {
  changeActionKeys,
  changeLevelKeys,
  changeOutcomeKeys,
  changeOutcomeTone,
  changeRiskKeys,
  changeRiskTone,
  changeStatusKeys,
  changeStatusTone,
  changeTypeKeys,
  changeTypeTone,
  formatChangeWindow,
  mapChangeError,
  primaryChangeAction,
} from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  changeQueryKeys,
  claimChange,
  getChange,
  getChangeCapabilities,
  getChangeConflicts,
  getChangeOptions,
  type ChangeAction,
  type ChangeDetail,
} from "@/services/changes-api";

type Tab = "overview" | "plan" | "approvals" | "links" | "history";

const finalStatuses = new Set(["CLOSED", "REJECTED", "CANCELLED"]);

/** Paket 3.4 (§17): change record with overview, plan, CAB approval, links and history. */
export function ChangeDetailPage() {
  const { t } = useTranslation();
  const { changeId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [action, setAction] = useState<ChangeAction | null>(null);

  const changeQuery = useQuery({ queryKey: changeQueryKeys.detail(changeId), queryFn: () => getChange(changeId), retry: false, enabled: changeId !== "" });
  const capabilitiesQuery = useQuery({ queryKey: changeQueryKeys.capabilities, queryFn: getChangeCapabilities, retry: false });
  const canEdit = changeQuery.data?.permissions.canEdit === true;
  const optionsQuery = useQuery({ queryKey: changeQueryKeys.options, queryFn: getChangeOptions, retry: false, enabled: canEdit });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: changeQueryKeys.all });
  const claimMutation = useMutation({
    mutationFn: () => claimChange(changeId),
    onSuccess: (next) => {
      queryClient.setQueryData(changeQueryKeys.detail(changeId), next);
      toast({ tone: "success", title: t("changes.detail.claimed") });
      refresh();
    },
    onError: (caught) => toast({ tone: "danger", title: t(mapChangeError(caught) ?? mapApiError(caught)) }),
  });
  const crumbs = [t("navigation.sections.tickets"), t("changes.title")];
  const back = (
    <Button variant="ghost" size="sm" onClick={() => navigate("/changes")}>
      <ArrowLeft size={14} aria-hidden="true" />
      {t("changes.detail.back")}
    </Button>
  );

  if (changeQuery.isLoading) {
    return (
      <section>
        <PageHeader crumbs={crumbs} title={t("changes.title")} />
        <PanelSkeleton label={t("ui.loading")} />
      </section>
    );
  }
  if (changeQuery.error || changeQuery.data === undefined) {
    return (
      <section>
        <PageHeader crumbs={crumbs} title={t("changes.title")} actions={back} />
        <EmptyState
          icon={<GitPullRequestArrow size={18} />}
          title={t("changes.detail.notFoundTitle")}
          body={t(mapChangeError(changeQuery.error) ?? (changeQuery.error ? mapApiError(changeQuery.error) : "changes.errors.notFound"))}
        />
      </section>
    );
  }

  const change = changeQuery.data;
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
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={optionsQuery.data === undefined || capabilitiesQuery.data === undefined} data-testid="change-edit">
          <Pencil size={14} aria-hidden="true" />
          {change.permissions.editScope === "window" ? t("changes.detail.reschedule") : t("changes.detail.edit")}
        </Button>
      ) : null}
      {change.permissions.canClaim ? (
        <Button variant="outline" size="sm" onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending} data-testid="change-claim">
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
              <DropdownMenuItem key={item} onSelect={() => setAction(item)} data-testid={`change-action-${item}`}>
                {t(changeActionKeys[item])}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {primary !== undefined ? (
        <Button variant="primary" size="sm" onClick={() => setAction(primary)} data-testid={`change-action-${primary}`}>
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
            <Badge tone={changeStatusTone(change.status)}>{t(changeStatusKeys[change.status])}</Badge>
            <Badge tone={changeTypeTone(change.type)}>{t(changeTypeKeys[change.type])}</Badge>
            <Badge tone={changeRiskTone(change.risk)}>{t("changes.detail.riskLine", { risk: t(changeRiskKeys[change.risk]) })}</Badge>
            <span aria-hidden="true">·</span>
            <span>{change.organizationalUnit.name}</span>
          </span>
        }
        actions={actions}
      />
      <div className="grid gap-4">
        <UnderlineTabs
          items={[
            { key: "overview", label: t("changes.detail.tabs.overview") },
            { key: "plan", label: t("changes.detail.tabs.plan") },
            { key: "approvals", label: t("changes.detail.tabs.approvals") },
            { key: "links", label: t("changes.detail.tabs.links"), count: change.serviceCount + change.assetCount + (change.problem ? 1 : 0) },
            { key: "history", label: t("changes.detail.tabs.history") },
          ]}
          active={tab}
          onChange={(key) => setTab(key as Tab)}
        />
        {tab === "overview" ? <ChangeOverview change={change} /> : null}
        {tab === "plan" ? <ChangePlan change={change} /> : null}
        {tab === "approvals" ? <ChangeApprovalsPanel change={change} onVoted={() => { toast({ tone: "success", title: t("changes.approvals.recorded") }); refresh(); }} /> : null}
        {tab === "links" ? <ChangeLinks change={change} /> : null}
        {tab === "history" ? <ChangeHistoryPanel changeId={change.id} versionKey={change.version} /> : null}
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
      <ChangeActionSheet action={action} change={change} onClose={() => setAction(null)} onDone={applyNext} />
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

function TextBlock({ title, value, emptyKey }: { readonly title: string; readonly value: string | null; readonly emptyKey?: string }) {
  const { t } = useTranslation();
  return (
    <Card className="p-0">
      <CardHeader title={title} />
      {value !== null && value.trim() !== "" ? (
        <p className="whitespace-pre-wrap px-4 py-3 text-[12.5px] text-foreground">{value}</p>
      ) : (
        <p className={`px-4 py-3 ${hintClassName}`}>{t((emptyKey ?? "changes.detail.notSet") as never)}</p>
      )}
    </Card>
  );
}

function ChangeConflictsCard({ change }: { readonly change: ChangeDetail }) {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: [...changeQueryKeys.conflicts(change.id), change.version],
    queryFn: () => getChangeConflicts(change.id),
    retry: false,
  });
  return (
    <Card className="p-0 lg:col-span-2">
      <CardHeader title={t("changes.conflicts.title")} />
      <div className="px-4 py-3">
        {query.isLoading ? (
          <PanelSkeleton label={t("ui.loading")} />
        ) : query.data ? (
          <>
            <ChangeConflictsList conflicts={query.data} />
            {query.data.acknowledgedAt ? (
              <p className={`mt-2 ${hintClassName}`}>{t("changes.conflicts.acknowledgedAt", { at: formatAssetDateTime(query.data.acknowledgedAt, i18n.language) })}</p>
            ) : null}
          </>
        ) : (
          <p className={hintClassName}>{t(mapChangeError(query.error) ?? mapApiError(query.error))}</p>
        )}
      </div>
    </Card>
  );
}

function ChangeOverview({ change }: { readonly change: ChangeDetail }) {
  const { t, i18n } = useTranslation();
  const date = (value: string | null) => (value === null ? "—" : formatAssetDateTime(value, i18n.language));
  const showConflicts = change.plannedStart !== null && change.plannedEnd !== null && !finalStatuses.has(change.status) && change.status !== "REVIEW";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("changes.fields.description")} />
        <p className="whitespace-pre-wrap px-4 py-3 text-[12.5px] text-foreground">{change.description}</p>
        {change.reason ? (
          <>
            <p className="px-4 pt-1 text-[12px] font-medium text-muted-foreground">{t("changes.fields.reason")}</p>
            <p className="whitespace-pre-wrap px-4 pb-3 text-[12.5px] text-foreground">{change.reason}</p>
          </>
        ) : null}
      </Card>
      <Card className="p-0">
        <CardHeader title={t("changes.detail.responsibility")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("changes.fields.owner")}>{change.owner?.displayName ?? t("changes.list.noOwner")}</DefinitionRow>
          <DefinitionRow label={t("changes.fields.requester")}>{change.requester?.displayName ?? "—"}</DefinitionRow>
          <DefinitionRow label={t("changes.fields.cabGroup")}>{change.cabGroup?.name ?? "—"}</DefinitionRow>
          <DefinitionRow label={t("changes.fields.organizationalUnit")}>
            {change.organizationalUnit.name}
            <span className="block text-[11.5px] text-muted-foreground">{change.organizationalUnit.ouPath}</span>
          </DefinitionRow>
          {change.template ? <DefinitionRow label={t("changes.fields.template")}>{change.template.name}</DefinitionRow> : null}
        </dl>
      </Card>
      <Card className="p-0">
        <CardHeader title={t("changes.detail.assessment")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("changes.fields.impact")}>{t(changeLevelKeys[change.impact])}</DefinitionRow>
          <DefinitionRow label={t("changes.fields.likelihood")}>{t(changeLevelKeys[change.likelihood])}</DefinitionRow>
          <DefinitionRow label={t("changes.fields.risk")}>
            <Badge tone={changeRiskTone(change.risk)}>{t(changeRiskKeys[change.risk])}</Badge>
          </DefinitionRow>
          <DefinitionRow label={t("changes.fields.causesDowntime")}>{change.causesDowntime ? t("changes.detail.yes") : t("changes.detail.no")}</DefinitionRow>
          {change.outcome ? (
            <DefinitionRow label={t("changes.fields.outcome")}>
              <Badge tone={changeOutcomeTone(change.outcome)}>{t(changeOutcomeKeys[change.outcome])}</Badge>
            </DefinitionRow>
          ) : null}
        </dl>
      </Card>
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("changes.detail.timeline")} />
        <dl className="grid divide-y divide-border/60 px-4 py-2 sm:grid-cols-2 sm:divide-y-0">
          <DefinitionRow label={t("changes.list.window")}>{formatChangeWindow(change.plannedStart, change.plannedEnd, i18n.language)}</DefinitionRow>
          <DefinitionRow label={t("changes.detail.actualWindow")}>
            {change.actualStart ? `${date(change.actualStart)} – ${change.actualEnd ? date(change.actualEnd) : t("changes.detail.inProgress")}` : "—"}
          </DefinitionRow>
          <DefinitionRow label={t("changes.detail.createdAt")}>{date(change.createdAt)}</DefinitionRow>
          <DefinitionRow label={t("changes.detail.submittedAt")}>{date(change.submittedAt)}</DefinitionRow>
          <DefinitionRow label={t("changes.detail.authorizedAt")}>{date(change.authorizedAt)}</DefinitionRow>
          <DefinitionRow label={t("changes.detail.closedAt")}>{date(change.closedAt)}</DefinitionRow>
          {change.cancelledAt ? <DefinitionRow label={t("changes.detail.cancelledAt")}>{date(change.cancelledAt)}</DefinitionRow> : null}
          {change.cancelReason ? <DefinitionRow label={t("changes.detail.cancelReason")}>{change.cancelReason}</DefinitionRow> : null}
        </dl>
      </Card>
      {showConflicts ? <ChangeConflictsCard change={change} /> : null}
      {change.reviewNotes ? (
        <div className="lg:col-span-2">
          <TextBlock title={t("changes.fields.reviewNotes")} value={change.reviewNotes} />
        </div>
      ) : null}
    </div>
  );
}

function ChangePlan({ change }: { readonly change: ChangeDetail }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TextBlock title={t("changes.fields.implementationPlan")} value={change.implementationPlan} />
      <TextBlock title={t("changes.fields.backoutPlan")} value={change.backoutPlan} />
      <TextBlock title={t("changes.fields.testPlan")} value={change.testPlan} />
      <TextBlock title={t("changes.fields.communicationPlan")} value={change.communicationPlan} />
    </div>
  );
}

function ChangeLinks({ change }: { readonly change: ChangeDetail }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0">
        <CardHeader title={t("changes.fields.services")} />
        {change.services.length === 0 ? (
          <p className={`px-4 py-3 ${hintClassName}`}>{t("changes.links.noServices")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {change.services.map((service) => (
              <li key={service.id} className="px-4 py-2 text-[12.5px] text-foreground">
                {service.name}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-0">
        <CardHeader title={t("changes.fields.assets")} />
        {change.assets.length === 0 ? (
          <p className={`px-4 py-3 ${hintClassName}`}>{t("changes.links.noAssets")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {change.assets.map((asset) => (
              <li key={asset.id} className="px-4 py-2 text-[12.5px]">
                <Link to={`/assets/${asset.id}`} className="tnum font-medium text-link hover:underline">
                  {asset.assetTag}
                </Link>{" "}
                <span className="text-foreground">{asset.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("changes.fields.problem")} />
        {change.problem ? (
          <p className="px-4 py-3 text-[12.5px]">
            <Link to={`/problems/${change.problem.id}`} className="tnum font-medium text-link hover:underline">
              {change.problem.number}
            </Link>{" "}
            <span className="text-foreground">{change.problem.title}</span>
          </p>
        ) : (
          <p className={`px-4 py-3 ${hintClassName}`}>{t("changes.links.noProblem")}</p>
        )}
      </Card>
    </div>
  );
}
