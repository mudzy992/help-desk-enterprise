import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Boxes, Download, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { AssetCatalogManager } from "@/components/assets/asset-catalog-manager";
import { AssetDirectorySyncCard } from "@/components/assets/asset-directory-sync-card";
import { AssetAssignSheet, AssetUnassignSheet } from "@/components/assets/asset-action-sheets";
import { AssetFormSheet } from "@/components/assets/asset-form-sheet";
import { assetBulkMoveMax, planBulkMove } from "@/lib/assets/asset-bulk-move";
import { AssetOverviewPanel } from "@/components/assets/asset-overview-panel";
import { AssetContractsPanel } from "@/components/assets/asset-contracts-panel";
import { AssetLicensesPanel } from "@/components/assets/asset-licenses-panel";
import { AssetTransfersPanel } from "@/components/assets/asset-transfers-panel";
import { AssetTransferSettingsCard } from "@/components/assets/asset-transfer-settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  errorTextClassName,
  hintClassName,
  selectCompactClassName,
  tableHeadClassName,
  tableRowClassName,
  ticketIdClassName,
} from "@/components/ui/control";
import { AssetImportPanel } from "@/components/assets/asset-import-panel";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterBar, FilterField, FilterToggles } from "@/components/ui/filter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import {
  assetStatusKeys,
  assetStatusTone,
  flattenLocationTree,
  formatAssetDate,
  localizedName,
  mapAssetError,
  resolveAssetIcon,
  warrantyState,
} from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { useAssetLocationsEnabled } from "@/lib/assets/use-asset-locations-enabled";
import {
  assetQueryKeys,
  assetStatuses,
  getAssetCapabilities,
  getAssetCatalog,
  getAssetOptions,
  listAssets,
  type AssetListFilters,
  type AssetListItem,
  type AssetSource,
  type AssetStatus,
  exportAssets,
} from "@/services/assets-api";

const pageSize = 50;
const assetsTabs = ["register", "overview", "transfers", "licenses", "contracts", "import", "catalog"] as const;
type AssetsTab = (typeof assetsTabs)[number];
const searchDelayMs = 300;

/**
 * Paket 3.2 (§17.2, §17.7): the asset register with filters and, for
 * `asset.type.manage`, the catalog of types, attributes and locations.
 */
export function AssetsPage() {
  const { t } = useTranslation();
  const { data: capabilities, isLoading, error } = useQuery({
    queryKey: assetQueryKeys.capabilities,
    queryFn: getAssetCapabilities,
    retry: false,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: AssetsTab = assetsTabs.includes(requestedTab as AssetsTab) ? (requestedTab as AssetsTab) : "register";

  const header = <PageHeader crumbs={[t("navigation.sections.services")]} title={t("assets.title")} subtitle={t("assets.subtitle")} />;

  if (isLoading) {
    return (
      <section>
        {header}
        <PanelSkeleton label={t("ui.loading")} />
      </section>
    );
  }
  if (error || capabilities === undefined || !capabilities.enabled) {
    return (
      <section>
        {header}
        <EmptyState icon={<Boxes size={18} />} title={t("assets.disabledTitle")} body={t("assets.disabledBody")} />
      </section>
    );
  }
  if (!capabilities.canRead) {
    return (
      <section>
        {header}
        <EmptyState icon={<Boxes size={18} />} title={t("assets.forbiddenTitle")} body={t("assets.forbiddenBody")} />
      </section>
    );
  }
  return (
    <section>
      {header}
      <div className="grid gap-4">
        <UnderlineTabs
          items={[
            { key: "register", label: t("assets.tabs.register") },
            ...(capabilities.canReadReports ? [{ key: "overview", label: t("assets.tabs.overview") }] : []),
            { key: "transfers", label: t("assets.tabs.transfers") },
            { key: "licenses", label: t("assets.tabs.licenses") },
            { key: "contracts", label: t("assets.tabs.contracts") },
            ...(capabilities.canImport ? [{ key: "import", label: t("assets.tabs.import") }] : []),
            ...(capabilities.canManageTypes ? [{ key: "catalog", label: t("assets.tabs.catalog") }] : []),
          ]}
          active={(tab === "catalog" && !capabilities.canManageTypes) || (tab === "import" && !capabilities.canImport) || (tab === "overview" && !capabilities.canReadReports) ? "register" : tab}
          onChange={(key) => setSearchParams(key === "register" ? {} : { tab: key }, { replace: true })}
        />
        {tab === "overview" && capabilities.canReadReports ? (
          <AssetOverviewPanel />
        ) : tab === "transfers" ? (
          <AssetTransfersPanel mode={{ kind: "all" }} canManage={capabilities.canManage} />
        ) : tab === "licenses" ? (
          <AssetLicensesPanel canManage={capabilities.canManageLicenses} />
        ) : tab === "contracts" ? (
          <AssetContractsPanel canManage={capabilities.canManageContracts} />
        ) : capabilities.canImport && tab === "import" ? (
          <AssetImportPanel />
        ) : capabilities.canManageTypes && tab === "catalog" ? (
          <div className="grid gap-4">
            <AssetCatalogManager />
            <AssetTransferSettingsCard />
            <AssetDirectorySyncCard />
          </div>
        ) : (
          <AssetRegister canManage={capabilities.canManage} />
        )}
      </div>
    </section>
  );
}

function AssetRegister({ canManage }: { readonly canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const locationsEnabled = useAssetLocationsEnabled();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState("");
  const [status, setStatus] = useState<AssetStatus | "">("");
  const [organizationalUnitId, setOrganizationalUnitId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [source, setSource] = useState<AssetSource | "">("");
  const [warrantyExpiring, setWarrantyExpiring] = useState(false);
  const [unassigned, setUnassigned] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);
  // C9b: register selection for one transfer record over several items.
  const [selected, setSelected] = useState<ReadonlyMap<string, AssetListItem>>(new Map());
  const [bulkSheet, setBulkSheet] = useState<"assign" | "unassign" | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchText.trim().length >= 2 ? searchText.trim() : ""), searchDelayMs);
    return () => window.clearTimeout(handle);
  }, [searchText]);

  const catalogQuery = useQuery({ queryKey: assetQueryKeys.catalog(false), queryFn: () => getAssetCatalog(false), retry: false });
  const optionsQuery = useQuery({ queryKey: assetQueryKeys.options, queryFn: getAssetOptions, retry: false });

  const filters: AssetListFilters = useMemo(
    () => ({
      search: search || undefined,
      typeId: typeId || undefined,
      status: status ? [status] : undefined,
      organizationalUnitId: organizationalUnitId || undefined,
      locationId: locationId || undefined,
      source: source || undefined,
      warrantyWithinDays: warrantyExpiring ? 30 : undefined,
      unassigned: unassigned || undefined,
      limit: pageSize,
    }),
    [search, typeId, status, organizationalUnitId, locationId, source, warrantyExpiring, unassigned],
  );

  const listQuery = useInfiniteQuery({
    queryKey: assetQueryKeys.list(filters),
    queryFn: ({ pageParam }) => listAssets({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });

  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = listQuery.data?.pages[0]?.total ?? 0;
  const locationRows = flattenLocationTree(catalogQuery.data?.locations ?? []).filter((row) => row.location.archivedAt === null);
  const bulkPlan = planBulkMove([...selected.values()]);
  const pageSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  function toggleSelected(item: AssetListItem) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Map(current);
      if (pageSelected) for (const item of items) next.delete(item.id);
      else for (const item of items) next.set(item.id, item);
      return next;
    });
  }

  function bulkDone() {
    setSelected(new Map());
    void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
  }

  const advancedCount = [typeId, status, organizationalUnitId, locationId, source, warrantyExpiring, unassigned].filter(Boolean).length;
  const hasFilters = Boolean(search) || advancedCount > 0;

  function resetFilters() {
    setSearchText("");
    setSearch("");
    setTypeId("");
    setStatus("");
    setOrganizationalUnitId("");
    setLocationId("");
    setSource("");
    setWarrantyExpiring(false);
    setUnassigned(false);
  }

  async function runExport(format: "xlsx" | "csv") {
    setExporting(format);
    try {
      await exportAssets(filters, format, i18n.language.startsWith("en") ? "en" : "bs");
    } catch (caught) {
      toast({ tone: "danger", title: t("assets.export.failed"), description: t(mapAssetError(caught) ?? mapApiError(caught)), error: caught });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="grid gap-3">
      <FilterBar
        label={t("assets.list.filtersLabel")}
        searchLabel={t("assets.list.searchLabel")}
        searchPlaceholder={t("assets.list.searchPlaceholder")}
        searchValue={searchText}
        onSearchChange={setSearchText}
        activeCount={advancedCount}
        resetLabel={t("assets.list.resetFilters")}
        onReset={resetFilters}
        actions={
          <>
              {(["xlsx", "csv"] as const).map((format) => (
                <Button
                  key={format}
                  variant="outline"
                  size="sm"
                  disabled={exporting !== null || total === 0}
                  onClick={() => void runExport(format)}
                  aria-label={t("assets.export.label", { format: format.toUpperCase() })}
                >
                  <Download size={14} aria-hidden="true" />
                  {exporting === format ? t("ui.loading") : format.toUpperCase()}
                </Button>
              ))}
            {canManage ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateOpen(true)}
                disabled={catalogQuery.data === undefined || optionsQuery.data === undefined}
              >
                <Plus size={14} aria-hidden="true" />
                {t("assets.list.create")}
              </Button>
            ) : null}
          </>
        }
      >
        <FilterField label={t("assets.fields.type")}>
          <select className={`${selectCompactClassName} w-full`} aria-label={t("assets.fields.type")} value={typeId} onChange={(event) => setTypeId(event.target.value)}>
            <option value="">{t("assets.list.allTypes")}</option>
            {(catalogQuery.data?.types ?? []).map((type) => (
              <option key={type.id} value={type.id}>
                {localizedName(type, i18n.language)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t("assets.fields.status")}>
          <select
            className={`${selectCompactClassName} w-full`}
            aria-label={t("assets.fields.status")}
            value={status}
            onChange={(event) => setStatus(event.target.value as AssetStatus | "")}
          >
            <option value="">{t("assets.list.allStatuses")}</option>
            {assetStatuses.map((value) => (
              <option key={value} value={value}>
                {t(assetStatusKeys[value])}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t("assets.fields.organizationalUnit")}>
          <select
            className={`${selectCompactClassName} w-full`}
            aria-label={t("assets.fields.organizationalUnit")}
            value={organizationalUnitId}
            onChange={(event) => setOrganizationalUnitId(event.target.value)}
          >
            <option value="">{t("assets.list.allUnits")}</option>
            {(optionsQuery.data?.units ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.path}
              </option>
            ))}
          </select>
        </FilterField>
        {locationsEnabled ? (
          <FilterField label={t("assets.fields.location")}>
            <select className={`${selectCompactClassName} w-full`} aria-label={t("assets.fields.location")} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">{t("assets.list.allLocations")}</option>
              {locationRows.map((row) => (
                <option key={row.location.id} value={row.location.id}>
                  {row.path}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}
        <FilterField label={t("assets.fields.source")}>
          <select
            className={`${selectCompactClassName} w-full`}
            aria-label={t("assets.fields.source")}
            value={source}
            onChange={(event) => setSource(event.target.value as AssetSource | "")}
          >
            <option value="">{t("assets.list.allSources")}</option>
            <option value="MANUAL">{t("assets.source.MANUAL")}</option>
            <option value="IMPORT">{t("assets.source.IMPORT")}</option>
            <option value="DIRECTORY">{t("assets.source.DIRECTORY")}</option>
          </select>
        </FilterField>
        <FilterToggles label={t("ui.filters.options")}>
          <Checkbox label={t("assets.list.warrantyExpiring")} checked={warrantyExpiring} onChange={(event) => setWarrantyExpiring(event.target.checked)} />
          <Checkbox label={t("assets.list.unassigned")} checked={unassigned} onChange={(event) => setUnassigned(event.target.checked)} />
        </FilterToggles>
      </FilterBar>

      <p className={hintClassName} aria-live="polite">
        {listQuery.isLoading ? t("ui.loading") : t("assets.list.count", { count: total, shown: items.length })}
      </p>

      {listQuery.error ? (
        <p role="alert" className={errorTextClassName}>
          {t(mapAssetError(listQuery.error) ?? mapApiError(listQuery.error))}
        </p>
      ) : null}

      {canManage && selected.size > 0 ? (
        <div role="region" aria-label={t("assets.bulk.region")} className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-[12.5px]">
          <span className="font-medium text-foreground">{t("assets.bulk.selectedCount", { count: selected.size })}</span>
          {bulkPlan.kind === "warehouse" ? (
            <Button size="sm" variant="primary" onClick={() => setBulkSheet("assign")}>
              {t("assets.actions.assign")}
            </Button>
          ) : null}
          {bulkPlan.kind === "holder" ? (
            <>
              <Button size="sm" variant="primary" onClick={() => setBulkSheet("assign")}>
                {t("assets.actions.reassign")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkSheet("unassign")}>
                {t("assets.actions.unassign")}
              </Button>
            </>
          ) : null}
          {bulkPlan.kind === "mixed" ? <span className={hintClassName}>{t("assets.bulk.mixed")}</span> : null}
          {bulkPlan.kind === "too_many" ? <span className={hintClassName}>{t("assets.bulk.tooMany", { max: assetBulkMoveMax })}</span> : null}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Map())}>
            {t("assets.bulk.clear")}
          </Button>
        </div>
      ) : null}

      {listQuery.isLoading ? (
        <PanelSkeleton label={t("ui.loading")} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Boxes size={18} />}
          title={hasFilters ? t("assets.list.noMatchesTitle") : t("assets.list.emptyTitle")}
          body={hasFilters ? t("assets.list.noMatchesBody") : t("assets.list.emptyBody")}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">{t("assets.list.caption")}</caption>
              <thead>
                <tr className={tableHeadClassName}>
                  {canManage ? (
                    <th scope="col" className="w-8 px-3 py-2 text-left">
                      <input type="checkbox" checked={pageSelected} onChange={togglePage} aria-label={t("assets.bulk.selectPage")} />
                    </th>
                  ) : null}
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.assetTag")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.name")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.status")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.assignedUser")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.organizationalUnit")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t(locationsEnabled ? "assets.fields.location" : "assets.fields.place")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.warrantyEndsAt")}</th>
                  <th scope="col" className="px-3 py-2 text-right">{t("assets.list.openTickets")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const Icon = resolveAssetIcon(item.type.icon);
                  const warranty = warrantyState(item.warrantyEndsAt);
                  return (
                    <tr key={item.id} className={tableRowClassName}>
                      {canManage ? (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggleSelected(item)}
                            aria-label={t("assets.bulk.select", { name: `${item.assetTag} ${item.name}` })}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <Link to={`/assets/${item.id}`} className={ticketIdClassName}>
                          {item.assetTag}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block truncate text-foreground">{item.name}</span>
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {localizedName(item.type, i18n.language)}
                              {item.serialNumber ? ` · ${item.serialNumber}` : ""}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={assetStatusTone(item.status)}>{t(assetStatusKeys[item.status])}</Badge>
                        {item.missingFromDirectoryAt ? (
                          <Badge tone="warning" className="ml-1">
                            {t("assets.list.missingFromDirectory")}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{item.assignedUser?.displayName ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">{item.organizationalUnit.name}</td>
                      <td className="px-3 py-2">
                        {locationsEnabled ? (item.location?.label ?? <span className="text-muted-foreground">—</span>) : item.organizationalUnit.path}
                      </td>
                      <td className="px-3 py-2">
                        <span className={warranty === "expired" ? "text-danger" : warranty === "expiring" ? "text-warning" : undefined}>
                          {formatAssetDate(item.warrantyEndsAt, i18n.language)}
                        </span>
                        {warranty === "expiring" ? <span className="sr-only"> {t("assets.warranty.expiring")}</span> : null}
                        {warranty === "expired" ? <span className="sr-only"> {t("assets.warranty.expired")}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.openTicketCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {listQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void listQuery.fetchNextPage()} disabled={listQuery.isFetchingNextPage}>
            {listQuery.isFetchingNextPage ? t("ui.loading") : t("assets.list.loadMore")}
          </Button>
        </div>
      ) : null}

      {canManage && (bulkPlan.kind === "warehouse" || bulkPlan.kind === "holder") ? (
        <>
          <AssetAssignSheet
            open={bulkSheet === "assign"}
            onOpenChange={(open) => (open ? undefined : setBulkSheet(null))}
            asset={{ id: bulkPlan.ids[0], assignedUser: bulkPlan.kind === "holder" ? bulkPlan.holder : null, assetIds: bulkPlan.ids }}
            onDone={bulkDone}
          />
          {bulkPlan.kind === "holder" ? (
            <AssetUnassignSheet
              open={bulkSheet === "unassign"}
              onOpenChange={(open) => (open ? undefined : setBulkSheet(null))}
              asset={{ id: bulkPlan.ids[0], assignedUser: bulkPlan.holder, assetIds: bulkPlan.ids }}
              onDone={bulkDone}
            />
          ) : null}
        </>
      ) : null}

      {canManage && catalogQuery.data && optionsQuery.data ? (
        <AssetFormSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          catalog={catalogQuery.data}
          options={optionsQuery.data}
          onSaved={(id) => {
            void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
            navigate(`/assets/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}
