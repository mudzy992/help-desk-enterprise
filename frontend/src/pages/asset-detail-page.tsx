import { useState, type ReactNode } from "react";
import { AssetCoveragePanel } from "@/components/assets/asset-coverage-panel";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Boxes, Copy, History, Pencil, RefreshCw, Trash2, UserMinus, UserPlus } from "lucide-react";
import { AssetAssignSheet, AssetStatusSheet, AssetUnassignSheet } from "@/components/assets/asset-action-sheets";
import { AssetFormSheet } from "@/components/assets/asset-form-sheet";
import { AssetRelationsPanel } from "@/components/assets/asset-relations-panel";
import { AssetProblemsPanel, useAssetProblems } from "@/components/problems/problem-reference-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName, hintClassName, ticketIdClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { AssetTransfersPanel } from "@/components/assets/asset-transfers-panel";
import { useToast } from "@/components/ui/toast";
import {
  assetAssignableStatuses,
  assetStatusKeys,
  assetStatusTone,
  formatAssetDate,
  formatAssetDateTime,
  formatAttributeValue,
  localizedLabel,
  localizedName,
  mapAssetError,
  resolveAssetIcon,
  warrantyState,
} from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { useAssetLocationsEnabled } from "@/lib/assets/use-asset-locations-enabled";
import {
  assetQueryKeys,
  deleteAsset,
  getAsset,
  getAssetCapabilities,
  getAssetCatalog,
  getAssetHistory,
  getAssetOptions,
  type AssetDetail,
  type AssetHistoryItem,
} from "@/services/assets-api";

type Tab = "overview" | "tickets" | "relations" | "coverage" | "transfers" | "problems" | "history";
type Sheet = "edit" | "duplicate" | "status" | "assign" | "unassign" | null;

/** Paket 3.2 (§17.3): asset card with overview, tickets, relations and history. */
export function AssetDetailPage() {
  const { t, i18n } = useTranslation();
  const { assetId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const capabilitiesQuery = useQuery({ queryKey: assetQueryKeys.capabilities, queryFn: getAssetCapabilities, retry: false });
  const assetQuery = useQuery({ queryKey: assetQueryKeys.detail(assetId), queryFn: () => getAsset(assetId), retry: false, enabled: assetId !== "" });
  const problemItems = useAssetProblems(assetId).data?.items ?? [];
  const canManage = assetQuery.data?.canManage === true;
  const catalogQuery = useQuery({ queryKey: assetQueryKeys.catalog(false), queryFn: () => getAssetCatalog(false), enabled: canManage, retry: false });
  const optionsQuery = useQuery({ queryKey: assetQueryKeys.options, queryFn: getAssetOptions, enabled: canManage, retry: false });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
  };

  const crumbs = [t("navigation.sections.services"), t("assets.title")];
  const back = (
    <Button variant="ghost" size="sm" onClick={() => navigate("/assets")}>
      <ArrowLeft size={14} aria-hidden="true" />
      {t("assets.detail.back")}
    </Button>
  );

  if (assetQuery.isLoading) {
    return (
      <section>
        <PageHeader crumbs={crumbs} title={t("assets.title")} />
        <PanelSkeleton label={t("ui.loading")} />
      </section>
    );
  }
  if (assetQuery.error || assetQuery.data === undefined) {
    return (
      <section>
        <PageHeader crumbs={crumbs} title={t("assets.title")} actions={back} />
        <EmptyState
          icon={<Boxes size={18} />}
          title={t("assets.detail.notFoundTitle")}
          body={t(mapAssetError(assetQuery.error) ?? (assetQuery.error ? mapApiError(assetQuery.error) : "assets.errors.notFound"))}
        />
      </section>
    );
  }

  const asset = assetQuery.data;
  const Icon = resolveAssetIcon(asset.type.icon);
  const canDelete = capabilitiesQuery.data?.canDelete === true;
  const canAssign = canManage && assetAssignableStatuses.includes(asset.status);
  const formReady = catalogQuery.data !== undefined && optionsQuery.data !== undefined;

  async function confirmDelete() {
    setDeletePending(true);
    setDeleteError(null);
    try {
      await deleteAsset(asset.id);
      toast({ tone: "success", title: t("assets.detail.deleted") });
      void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
      navigate("/assets");
    } catch (caught) {
      setDeleteError(t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setDeletePending(false);
    }
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      {back}
      {canManage ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setSheet("edit")} disabled={!formReady}>
            <Pencil size={14} aria-hidden="true" />
            {t("assets.actions.edit")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSheet("duplicate")} disabled={!formReady}>
            <Copy size={14} aria-hidden="true" />
            {t("assets.actions.duplicate")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSheet("status")}>
            <RefreshCw size={14} aria-hidden="true" />
            {t("assets.actions.changeStatus")}
          </Button>
          {canAssign ? (
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
      {canDelete ? (
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
      <div className="grid gap-4">

        {asset.frequentFailure.flagged ? (
          <div role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-foreground">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <span>
              {t("assets.detail.frequentFailure", { count: asset.frequentFailure.count, days: asset.frequentFailure.days })}
            </span>
          </div>
        ) : null}
        {asset.missingFromDirectoryAt ? (
          <div role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-foreground">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <span>{t("assets.detail.missingFromDirectory", { date: formatAssetDate(asset.missingFromDirectoryAt, i18n.language) })}</span>
          </div>
        ) : null}

        <UnderlineTabs
          items={[
            { key: "overview", label: t("assets.detail.tabs.overview") },
            { key: "tickets", label: t("assets.detail.tabs.tickets"), count: asset.tickets.total },
            { key: "relations", label: t("assets.detail.tabs.relations"), count: asset.relations.length },
            { key: "coverage", label: t("assets.detail.tabs.coverage"), count: (asset.licenses?.length ?? 0) + (asset.contracts?.length ?? 0) },
            { key: "transfers", label: t("assets.detail.tabs.transfers") },
            // P5b: only when the asset is affected by problems the viewer may see.
            ...(problemItems.length > 0 ? [{ key: "problems", label: t("problems.links.assetProblemsTab"), count: problemItems.length }] : []),
            { key: "history", label: t("assets.detail.tabs.history") },
          ]}
          active={tab}
          onChange={(key) => setTab(key as Tab)}
        />

        {tab === "overview" ? <AssetOverview asset={asset} /> : null}
        {tab === "tickets" ? <AssetTickets asset={asset} /> : null}
        {tab === "relations" ? <AssetRelationsPanel asset={asset} onChanged={refresh} /> : null}
        {tab === "coverage" ? <AssetCoveragePanel asset={asset} /> : null}
        {tab === "transfers" ? <AssetTransfersPanel mode={{ kind: "asset", assetId: asset.id }} canManage={canManage} /> : null}
        {tab === "problems" && problemItems.length > 0 ? <AssetProblemsPanel items={problemItems} /> : null}
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
            <AssetStatusSheet open={sheet === "status"} onOpenChange={(open) => (open ? undefined : setSheet(null))} asset={asset} onDone={refresh} />
            <AssetAssignSheet open={sheet === "assign"} onOpenChange={(open) => (open ? undefined : setSheet(null))} asset={asset} onDone={refresh} />
            <AssetUnassignSheet open={sheet === "unassign"} onOpenChange={(open) => (open ? undefined : setSheet(null))} asset={asset} onDone={refresh} />
          </>
        ) : null}
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={t("assets.detail.deleteTitle")}
          description={t("assets.detail.deleteBody", { name: `${asset.assetTag} · ${asset.name}` })}
          intent="danger"
          confirmLabel={t("assets.actions.delete")}
          isPending={deletePending}
          onConfirm={() => void confirmDelete()}
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

function DefinitionRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(120px,40%)_1fr] gap-2 py-1.5 text-[12.5px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function AssetOverview({ asset }: { readonly asset: AssetDetail }) {
  const { t, i18n } = useTranslation();
  const locationsEnabled = useAssetLocationsEnabled();
  const language = i18n.language;
  const warranty = warrantyState(asset.warrantyEndsAt);
  const money =
    asset.purchaseCost === null
      ? "—"
      : new Intl.NumberFormat(language.startsWith("bs") ? "bs-BA" : "en-GB", {
          style: "currency",
          currency: asset.currency ?? "BAM",
        }).format(asset.purchaseCost);
  const attributes = asset.attributeDefinitions.filter((definition) => !definition.archived || asset.attributes[definition.key] !== undefined);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0">
        <CardHeader title={t("assets.detail.basics")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("assets.fields.assetTag")}>{asset.assetTag}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.manufacturer")}>{asset.manufacturer ?? "—"}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.model")}>{asset.model ?? "—"}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.serialNumber")}>{asset.serialNumber ?? "—"}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.service")}>{asset.service?.name ?? "—"}</DefinitionRow>
          {asset.externalId ? <DefinitionRow label={t("assets.fields.externalId")}>{asset.externalId}</DefinitionRow> : null}
          {asset.lastSeenAt ? (
            <DefinitionRow label={t("assets.fields.lastSeenAt")}>{formatAssetDateTime(asset.lastSeenAt, language)}</DefinitionRow>
          ) : null}
          <DefinitionRow label={t("assets.fields.notes")}>
            {asset.notes ? <span className="whitespace-pre-wrap">{asset.notes}</span> : "—"}
          </DefinitionRow>
        </dl>
      </Card>

      <Card className="p-0">
        <CardHeader title={t("assets.detail.assignment")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("assets.fields.assignedUser")}>
            {asset.assignedUser ? (
              <span>
                {asset.assignedUser.displayName}
                <span className="block text-[11.5px] text-muted-foreground">{asset.assignedUser.email}</span>
                {asset.assignmentSuggested ? (
                  <Badge tone="warning" className="mt-1">
                    {t("assets.detail.assignmentSuggested")}
                  </Badge>
                ) : null}
              </span>
            ) : (
              "—"
            )}
          </DefinitionRow>
          <DefinitionRow label={t("assets.fields.assignedAt")}>
            {asset.assignedAt ? formatAssetDateTime(asset.assignedAt, language) : "—"}
          </DefinitionRow>
          <DefinitionRow label={t("assets.fields.organizationalUnit")}>
            {asset.organizationalUnit.name}
            <span className="block text-[11.5px] text-muted-foreground">{asset.organizationalUnit.path}</span>
          </DefinitionRow>
          {locationsEnabled ? (
            <DefinitionRow label={t("assets.fields.location")}>{asset.location?.label ?? "—"}</DefinitionRow>
          ) : (
            <DefinitionRow label={t("assets.fields.place")}>{asset.organizationalUnit.pathLabel}</DefinitionRow>
          )}
        </dl>
      </Card>

      <Card className="p-0">
        <CardHeader title={t("assets.detail.purchase")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("assets.fields.purchaseDate")}>{formatAssetDate(asset.purchaseDate, language)}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.purchaseCost")}>{money}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.supplier")}>{asset.supplier ?? "—"}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.warrantyEndsAt")}>
            <span className="flex flex-wrap items-center gap-2">
              {formatAssetDate(asset.warrantyEndsAt, language)}
              {warranty === "expired" ? <Badge tone="danger">{t("assets.warranty.expired")}</Badge> : null}
              {warranty === "expiring" ? <Badge tone="warning">{t("assets.warranty.expiring")}</Badge> : null}
            </span>
          </DefinitionRow>
        </dl>
      </Card>

      <Card className="p-0">
        <CardHeader title={t("assets.detail.attributes")} />
        {attributes.length === 0 ? (
          <p className={`px-4 py-3 ${hintClassName}`}>{t("assets.detail.noAttributes")}</p>
        ) : (
          <dl className="divide-y divide-border/60 px-4 py-2">
            {attributes.map((definition) => (
              <DefinitionRow key={definition.key} label={localizedLabel(definition, language)}>
                {formatAttributeValue(asset.attributes[definition.key], definition.dataType, language, t("assets.detail.yes"), t("assets.detail.no"))}
              </DefinitionRow>
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
}

function AssetTickets({ asset }: { readonly asset: AssetDetail }) {
  const { t, i18n } = useTranslation();
  if (asset.tickets.recent.length === 0) {
    return <EmptyState icon={<History size={18} />} title={t("assets.detail.noTicketsTitle")} body={t("assets.detail.noTicketsBody")} />;
  }
  return (
    <Card className="p-0">
      <CardHeader
        title={t("assets.detail.ticketsTitle")}
        subtitle={t("assets.detail.ticketsSubtitle", { total: asset.tickets.total, open: asset.tickets.open })}
      />
      <ul className="divide-y divide-border/60">
        {asset.tickets.recent.map((ticket) => (
          <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[12.5px]">
            <span className="flex min-w-0 items-center gap-2">
              <Link to={`/tickets/${ticket.id}`} className={ticketIdClassName}>
                {ticket.ticketNumber}
              </Link>
              <span className="truncate text-foreground">{ticket.title}</span>
              {ticket.isPrimary ? <Badge tone="primary">{t("assets.detail.primaryLink")}</Badge> : null}
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Badge tone="neutral">{ticket.status}</Badge>
              {formatAssetDateTime(ticket.createdAt, i18n.language)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function historyText(item: AssetHistoryItem, users: Readonly<Record<string, string | null>>, t: (key: string, options?: Record<string, unknown>) => string): string {
  const detail = item.detail;
  const userName = typeof detail.userId === "string" ? (users[detail.userId] ?? t("assets.history.unknownUser")) : null;
  switch (item.action) {
    case "status":
      return t("assets.history.text.status", {
        from: typeof detail.from === "string" ? t(`assets.status.${detail.from}`) : "—",
        to: typeof detail.to === "string" ? t(`assets.status.${detail.to}`) : "—",
      });
    case "assigned":
      return t("assets.history.text.assigned", { name: userName ?? "—" });
    case "unassigned":
      return t("assets.history.text.unassigned", { name: userName ?? "—" });
    case "updated": {
      const changes = detail.changes && typeof detail.changes === "object" ? Object.keys(detail.changes as object) : [];
      return t("assets.history.text.updated", { fields: changes.join(", ") || "—" });
    }
    default:
      return t(`assets.history.actions.${item.action}`, { defaultValue: item.action });
  }
}

function AssetHistoryPanel({ assetId }: { readonly assetId: string }) {
  const { t, i18n } = useTranslation();
  const historyQuery = useInfiniteQuery({
    queryKey: assetQueryKeys.history(assetId),
    queryFn: ({ pageParam }) => getAssetHistory(assetId, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });
  if (historyQuery.isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (historyQuery.error) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapAssetError(historyQuery.error) ?? mapApiError(historyQuery.error))}
      </p>
    );
  }
  const pages = historyQuery.data?.pages ?? [];
  const users = Object.assign({}, ...pages.map((page) => page.users)) as Record<string, string | null>;
  const items = pages.flatMap((page) => page.items);
  const translate = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  return (
    <Card className="p-0">
      <CardHeader title={t("assets.history.title")} />
      <ol className="divide-y divide-border/60">
        {items.map((item) => {
          const reason = typeof item.detail.reason === "string" ? item.detail.reason : typeof item.detail.note === "string" ? item.detail.note : null;
          return (
            <li key={item.id} className="grid gap-0.5 px-4 py-2 text-[12.5px]">
              <span className="text-foreground">{historyText(item, users, translate)}</span>
              {reason ? <span className="text-muted-foreground">„{reason}“</span> : null}
              {typeof item.detail.transferNumber === "string" ? (
                <span className="text-muted-foreground">{t("assets.history.transfer", { number: item.detail.transferNumber })}</span>
              ) : null}
              <span className="text-[11.5px] text-muted-foreground">
                {formatAssetDateTime(item.createdAt, i18n.language)} ·{" "}
                {item.actorUserId ? (users[item.actorUserId] ?? t("assets.history.unknownUser")) : t("assets.history.system")}
              </span>
            </li>
          );
        })}
      </ol>
      {historyQuery.hasNextPage ? (
        <div className="flex justify-center p-3">
          <Button variant="outline" size="sm" onClick={() => void historyQuery.fetchNextPage()} disabled={historyQuery.isFetchingNextPage}>
            {t("assets.list.loadMore")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
