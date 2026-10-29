import { useState } from "react";
import {
  AssetHistoryPanel,
  AssetOverview,
  AssetTickets,
} from "@/components/assets/asset-detail-sections";
import { queryKeys } from "@/lib/query/query-keys";
import { AssetCoveragePanel } from "@/components/assets/asset-coverage-panel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Copy,
  Pencil,
  RefreshCw,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import {
  AssetAssignSheet,
  AssetStatusSheet,
  AssetUnassignSheet,
} from "@/components/assets/asset-action-sheets";
import { AssetFormSheet } from "@/components/assets/asset-form-sheet";
import { AssetRelationsPanel } from "@/components/assets/asset-relations-panel";
import { AssetProblemsPanel, useAssetProblems } from "@/components/problems/problem-reference-list";
import {
  RelatedChangesPanel,
  useChangeModuleAccess,
} from "@/components/changes/related-changes-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityDetailQueryError } from "@/components/entity-list/entity-detail-query-error";
import { PageHeader } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { AssetTransfersPanel } from "@/components/assets/asset-transfers-panel";
import { useToast } from "@/components/ui/toast";
import {
  assetStatusKeys,
  assetStatusTone,
  formatAssetDate,
  localizedName,
  mapAssetError,
  resolveAssetActionAvailability,
  resolveAssetIcon,
} from "@/lib/assets/asset-view";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
import { resolveEntityDetailState } from "@/lib/entity-list/resolve-entity-detail-state";
import { useEntityMutation } from "@/lib/entity-list/use-entity-mutation";
import {
  assetQueryKeys,
  deleteAsset,
  getAsset,
  getAssetCapabilities,
  getAssetCatalog,
  getAssetOptions,
} from "@/services/assets-api";

type Tab =
  | "overview"
  | "tickets"
  | "relations"
  | "coverage"
  | "transfers"
  | "problems"
  | "changes"
  | "history";
type Sheet = "edit" | "duplicate" | "status" | "assign" | "unassign" | null;

/** Delivery invariant (requirement): asset card with overview, tickets, relations and history. */
export function AssetDetailPage() {
  const { t, i18n } = useTranslation();
  const { assetId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const capabilitiesQuery = useQuery({
    queryKey: assetQueryKeys.capabilities,
    queryFn: getAssetCapabilities,
    retry: false,
  });
  const assetQuery = useQuery({
    queryKey: assetQueryKeys.detail(assetId),
    queryFn: () => getAsset(assetId),
    retry: false,
    enabled: assetId !== "",
  });
  const changeAccess = useChangeModuleAccess();
  const problemItems = useAssetProblems(assetId).data?.items ?? [];
  const canManage = assetQuery.data?.canManage === true;
  const catalogQuery = useQuery({
    queryKey: assetQueryKeys.catalog(false),
    queryFn: () => getAssetCatalog(false),
    enabled: canManage,
    retry: false,
  });
  const optionsQuery = useQuery({
    queryKey: assetQueryKeys.options,
    queryFn: getAssetOptions,
    enabled: canManage,
    retry: false,
  });

  const refresh = () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.detail(assetId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assetLists }),
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.history(assetId) }),
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.impact(assetId) }),
    ]);
  };

  const deleteMutation = useEntityMutation<string>({
    mutationFn: deleteAsset,
    invalidate: () => [queryKeys.assetLists],
    onSuccess: () => {
      toast({ tone: "success", title: t("assets.detail.deleted") });
      navigate("/assets");
    },
    onError: (caught) => setDeleteError(t(mapAssetError(caught) ?? mapApiError(caught))),
  });

  const crumbs = [t("navigation.sections.services"), t("assets.title")];
  const back = (
    <Button variant="ghost" size="sm" onClick={() => navigate("/assets")}>
      <ArrowLeft size={14} aria-hidden="true" />
      {t("assets.detail.back")}
    </Button>
  );

  const detailState = resolveEntityDetailState({
    isLoading: assetQuery.isLoading,
    hasData: assetQuery.data !== undefined,
    error: assetQuery.error,
  });
  if (detailState === "loading") {
    return (
      <section>
        <PageHeader crumbs={crumbs} title={t("assets.title")} />
        <PanelSkeleton label={t("ui.loading")} />
      </section>
    );
  }
  if (detailState === "error") {
    return (
      <section className="grid gap-4">
        <PageHeader crumbs={crumbs} title={t("assets.title")} actions={back} />
        <EntityDetailQueryError
          messageKey={mapAssetError(assetQuery.error) ?? mapApiError(assetQuery.error)}
          requestId={readApiRequestId(assetQuery.error)}
          retrying={assetQuery.isFetching}
          onRetry={() => void assetQuery.refetch()}
        />
      </section>
    );
  }
  if (detailState === "not_found" || assetQuery.data === undefined) {
    return (
      <section>
        <PageHeader crumbs={crumbs} title={t("assets.title")} actions={back} />
        <EmptyState
          icon={<Boxes size={18} />}
          title={t("assets.detail.notFoundTitle")}
          body={t("assets.errors.notFound")}
        />
      </section>
    );
  }

  const asset = assetQuery.data;
  const supportingError = capabilitiesQuery.error ?? catalogQuery.error ?? optionsQuery.error;
  const Icon = resolveAssetIcon(asset.type.icon);
  const actionAvailability = resolveAssetActionAvailability({
    canManage,
    canDelete: capabilitiesQuery.data?.canDelete === true,
    status: asset.status,
    assigned: asset.assignedUser !== null,
  });
  const formReady = catalogQuery.data !== undefined && optionsQuery.data !== undefined;

  const actions = (
    <div className="flex flex-wrap gap-2">
      {back}
      {canManage ? (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSheet("edit")}
            disabled={!formReady}
          >
            <Pencil size={14} aria-hidden="true" />
            {t("assets.actions.edit")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSheet("duplicate")}
            disabled={!formReady}
          >
            <Copy size={14} aria-hidden="true" />
            {t("assets.actions.duplicate")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSheet("status")}>
            <RefreshCw size={14} aria-hidden="true" />
            {t("assets.actions.changeStatus")}
          </Button>
          {actionAvailability.assign ? (
            <Button variant="primary" size="sm" onClick={() => setSheet("assign")}>
              <UserPlus size={14} aria-hidden="true" />
              {asset.assignedUser ? t("assets.actions.reassign") : t("assets.actions.assign")}
            </Button>
          ) : null}
          {asset.assignedUser ? (
            <Button variant="outline" size="sm" onClick={() => setSheet("unassign")}>
              <UserMinus size={14} aria-hidden="true" />
              {t("assets.actions.unassign")}
            </Button>
          ) : null}
        </>
      ) : null}
      {actionAvailability.delete ? (
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
        >
          <Trash2 size={14} aria-hidden="true" />
          {t("assets.actions.delete")}
        </Button>
      ) : null}
    </div>
  );

  return (
    <section>
      <PageHeader
        crumbs={crumbs}
        title={
          <span className="flex items-center gap-2">
            <Icon size={20} className="text-muted-foreground" aria-hidden="true" />
            <span>
              {asset.assetTag} · {asset.name}
            </span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={assetStatusTone(asset.status)}>{t(assetStatusKeys[asset.status])}</Badge>
            <span>{localizedName(asset.type, i18n.language)}</span>
            <span aria-hidden="true">·</span>
            <span>{t(`assets.source.${asset.source}` as const)}</span>
          </span>
        }
        actions={actions}
      />
      {assetQuery.error !== null ? (
        <EntityDetailQueryError
          messageKey={mapAssetError(assetQuery.error) ?? mapApiError(assetQuery.error)}
          requestId={readApiRequestId(assetQuery.error)}
          retrying={assetQuery.isFetching}
          onRetry={() => void assetQuery.refetch()}
        />
      ) : null}
      {supportingError !== null ? (
        <EntityDetailQueryError
          messageKey={mapAssetError(supportingError) ?? mapApiError(supportingError)}
          requestId={readApiRequestId(supportingError)}
          retrying={
            capabilitiesQuery.isFetching || catalogQuery.isFetching || optionsQuery.isFetching
          }
          onRetry={() =>
            void Promise.all([
              capabilitiesQuery.refetch(),
              catalogQuery.refetch(),
              optionsQuery.refetch(),
            ])
          }
        />
      ) : null}
      <div className="grid gap-4">
        {asset.frequentFailure.flagged ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-foreground"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <span>
              {t("assets.detail.frequentFailure", {
                count: asset.frequentFailure.count,
                days: asset.frequentFailure.days,
              })}
            </span>
          </div>
        ) : null}
        {asset.missingFromDirectoryAt ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-foreground"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <span>
              {t("assets.detail.missingFromDirectory", {
                date: formatAssetDate(asset.missingFromDirectoryAt, i18n.language),
              })}
            </span>
          </div>
        ) : null}

        <UnderlineTabs
          items={[
            { key: "overview", label: t("assets.detail.tabs.overview") },
            { key: "tickets", label: t("assets.detail.tabs.tickets"), count: asset.tickets.total },
            {
              key: "relations",
              label: t("assets.detail.tabs.relations"),
              count: asset.relations.length,
            },
            {
              key: "coverage",
              label: t("assets.detail.tabs.coverage"),
              count: (asset.licenses?.length ?? 0) + (asset.contracts?.length ?? 0),
            },
            { key: "transfers", label: t("assets.detail.tabs.transfers") },
            // P5b: only when the asset is affected by problems the viewer may see.
            ...(problemItems.length > 0
              ? [
                  {
                    key: "problems",
                    label: t("problems.links.assetProblemsTab"),
                    count: problemItems.length,
                  },
                ]
              : []),
            ...(changeAccess.visible ? [{ key: "changes", label: t("changes.related.tab") }] : []),
            { key: "history", label: t("assets.detail.tabs.history") },
          ]}
          active={tab}
          onChange={(key) => setTab(key as Tab)}
        />

        {tab === "overview" ? <AssetOverview asset={asset} /> : null}
        {tab === "tickets" ? <AssetTickets asset={asset} /> : null}
        {tab === "relations" ? <AssetRelationsPanel asset={asset} onChanged={refresh} /> : null}
        {tab === "coverage" ? <AssetCoveragePanel asset={asset} /> : null}
        {tab === "transfers" ? (
          <AssetTransfersPanel mode={{ kind: "asset", assetId: asset.id }} canManage={canManage} />
        ) : null}
        {tab === "problems" && problemItems.length > 0 ? (
          <AssetProblemsPanel items={problemItems} />
        ) : null}
        {tab === "changes" && changeAccess.visible ? (
          <RelatedChangesPanel
            target={{ kind: "asset", assetId: asset.id }}
            prefill={{ assets: [{ id: asset.id, assetTag: asset.assetTag, name: asset.name }] }}
          />
        ) : null}
        {tab === "history" ? <AssetHistoryPanel assetId={asset.id} /> : null}

        {canManage && catalogQuery.data && optionsQuery.data ? (
          <AssetFormSheet
            open={sheet === "edit" || sheet === "duplicate"}
            onOpenChange={(open) => (open ? undefined : setSheet(null))}
            catalog={catalogQuery.data}
            options={optionsQuery.data}
            asset={asset}
            duplicate={sheet === "duplicate"}
            onSaved={(id) => {
              refresh();
              if (id !== asset.id) navigate(`/assets/${id}`);
              toast({ tone: "success", title: t("assets.form.saved") });
            }}
          />
        ) : null}
        {canManage ? (
          <>
            <AssetStatusSheet
              open={sheet === "status"}
              onOpenChange={(open) => (open ? undefined : setSheet(null))}
              asset={asset}
              onDone={refresh}
            />
            <AssetAssignSheet
              open={sheet === "assign"}
              onOpenChange={(open) => (open ? undefined : setSheet(null))}
              asset={asset}
              onDone={refresh}
            />
            <AssetUnassignSheet
              open={sheet === "unassign"}
              onOpenChange={(open) => (open ? undefined : setSheet(null))}
              asset={asset}
              onDone={refresh}
            />
          </>
        ) : null}
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={t("assets.detail.deleteTitle")}
          description={t("assets.detail.deleteBody", { name: `${asset.assetTag} · ${asset.name}` })}
          intent="danger"
          confirmLabel={t("assets.actions.delete")}
          isPending={deleteMutation.isPending}
          onConfirm={() => {
            setDeleteError(null);
            deleteMutation.mutate(asset.id);
          }}
        >
          {deleteError ? (
            <p role="alert" className={errorTextClassName}>
              {deleteError}
            </p>
          ) : null}
        </ConfirmDialog>
      </div>
    </section>
  );
}
