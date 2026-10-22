import { AssetRegisterActions } from "./asset-register-actions";
import { AssetRegisterTable } from "./asset-register-table";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Boxes, Download, Plus } from "lucide-react";
import { EntityListQueryError } from "@/components/entity-list/entity-list-query-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { hintClassName, selectCompactClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField, FilterToggles } from "@/components/ui/filter-bar";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { assetBulkMoveMax, planBulkMove } from "@/lib/assets/asset-bulk-move";
import {
  parseAssetBoolean,
  parseAssetSource,
  parseAssetStatus,
} from "@/lib/assets/parse-asset-register-query";
import {
  assetStatusKeys,
  flattenLocationTree,
  localizedName,
  mapAssetError,
} from "@/lib/assets/asset-view";
import { useAssetLocationsEnabled } from "@/lib/assets/use-asset-locations-enabled";
import {
  entityMutationQueryKeys,
  invalidateEntityQueries,
} from "@/lib/entity-list/entity-mutation-query-keys";
import { resolveEntityListState } from "@/lib/entity-list/resolve-entity-list-state";
import { useDebouncedValue } from "@/lib/entity-list/use-debounced-value";
import { useUrlBackedSearch } from "@/lib/entity-list/use-url-backed-search";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
import {
  assetQueryKeys,
  assetStatuses,
  exportAssets,
  getAssetCatalog,
  getAssetOptions,
  listAssets,
  type AssetListFilters,
  type AssetListItem,
} from "@/services/assets-api";

const pageSize = 50;
const searchDelayMs = 300;

export function AssetRegister({ canManage }: { readonly canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const locationsEnabled = useAssetLocationsEnabled();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useUrlBackedSearch(params.get("search") ?? "");
  const search = useDebouncedValue(
    searchText.trim().length >= 2 ? searchText.trim() : "",
    searchDelayMs,
  );
  // Search uses history PUSH so Back/Forward steps through committed values;
  // external URL changes update the ref without being pushed again.
  const urlSearch = params.get("search") ?? "";
  const committedSearchRef = useRef(urlSearch);
  useEffect(() => {
    committedSearchRef.current = urlSearch;
  }, [urlSearch]);
  useEffect(() => {
    if (search === committedSearchRef.current) return;
    committedSearchRef.current = search;
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (search === "") next.delete("search");
      else next.set("search", search);
      return next;
    });
  }, [search, setParams]);
  const typeId = params.get("type") ?? "";
  const status = parseAssetStatus(params.get("status"));
  const organizationalUnitId = params.get("unit") ?? "";
  const locationId = params.get("location") ?? "";
  const source = parseAssetSource(params.get("source"));
  const warrantyExpiring = parseAssetBoolean(params.get("warranty"));
  const unassigned = parseAssetBoolean(params.get("unassigned"));
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);
  // C9b: register selection for one transfer record over several items.
  const [selected, setSelected] = useState<ReadonlyMap<string, AssetListItem>>(new Map());
  const [bulkSheet, setBulkSheet] = useState<"assign" | "unassign" | null>(null);
  const { toast } = useToast();

  function setFilterParam(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === "") next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  const catalogQuery = useQuery({
    queryKey: assetQueryKeys.catalog(false),
    queryFn: () => getAssetCatalog(false),
    retry: false,
  });
  const optionsQuery = useQuery({
    queryKey: assetQueryKeys.options,
    queryFn: getAssetOptions,
    retry: false,
  });

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
    [
      search,
      typeId,
      status,
      organizationalUnitId,
      locationId,
      source,
      warrantyExpiring,
      unassigned,
    ],
  );

  useEffect(() => {
    setSelected(new Map());
  }, [
    search,
    typeId,
    status,
    organizationalUnitId,
    locationId,
    source,
    warrantyExpiring,
    unassigned,
  ]);

  const listQuery = useInfiniteQuery({
    queryKey: assetQueryKeys.list(filters),
    queryFn: ({ pageParam }) => listAssets({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });

  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = listQuery.data?.pages[0]?.total ?? 0;
  const listState = resolveEntityListState({
    isLoading: listQuery.isLoading,
    hasError: listQuery.error !== null,
    itemCount: items.length,
  });
  const locationRows = flattenLocationTree(catalogQuery.data?.locations ?? []).filter(
    (row) => row.location.archivedAt === null,
  );
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
    void invalidateEntityQueries(queryClient, entityMutationQueryKeys.assets.records);
  }

  const advancedCount = [
    typeId,
    status,
    organizationalUnitId,
    locationId,
    source,
    warrantyExpiring,
    unassigned,
  ].filter(Boolean).length;
  const hasFilters = Boolean(search) || advancedCount > 0;

  function resetFilters() {
    setSearchText("");
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of [
          "search",
          "type",
          "status",
          "unit",
          "location",
          "source",
          "warranty",
          "unassigned",
        ])
          next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  async function runExport(format: "xlsx" | "csv") {
    setExporting(format);
    try {
      await exportAssets(filters, format, i18n.language.startsWith("en") ? "en" : "bs");
    } catch (caught) {
      toast({
        tone: "danger",
        title: t("assets.export.failed"),
        description: t(mapAssetError(caught) ?? mapApiError(caught)),
        error: caught,
      });
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
        onSearchChange={(value) => {
          setSearchText(value);
        }}
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
          <select
            className={`${selectCompactClassName} w-full`}
            aria-label={t("assets.fields.type")}
            value={typeId}
            onChange={(event) => setFilterParam("type", event.target.value)}
          >
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
            onChange={(event) => setFilterParam("status", event.target.value)}
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
            onChange={(event) => setFilterParam("unit", event.target.value)}
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
            <select
              className={`${selectCompactClassName} w-full`}
              aria-label={t("assets.fields.location")}
              value={locationId}
              onChange={(event) => setFilterParam("location", event.target.value)}
            >
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
            onChange={(event) => setFilterParam("source", event.target.value)}
          >
            <option value="">{t("assets.list.allSources")}</option>
            <option value="MANUAL">{t("assets.source.MANUAL")}</option>
            <option value="IMPORT">{t("assets.source.IMPORT")}</option>
            <option value="DIRECTORY">{t("assets.source.DIRECTORY")}</option>
          </select>
        </FilterField>
        <FilterToggles label={t("ui.filters.options")}>
          <Checkbox
            label={t("assets.list.warrantyExpiring")}
            checked={warrantyExpiring}
            onChange={(event) => setFilterParam("warranty", event.target.checked ? "true" : "")}
          />
          <Checkbox
            label={t("assets.list.unassigned")}
            checked={unassigned}
            onChange={(event) => setFilterParam("unassigned", event.target.checked ? "true" : "")}
          />
        </FilterToggles>
      </FilterBar>

      {(() => {
        const setupError = catalogQuery.error ?? optionsQuery.error;
        return setupError ? (
          <EntityListQueryError
            messageKey={mapAssetError(setupError) ?? mapApiError(setupError)}
            requestId={readApiRequestId(setupError)}
            retrying={catalogQuery.isFetching || optionsQuery.isFetching}
            onRetry={() => void Promise.all([catalogQuery.refetch(), optionsQuery.refetch()])}
          />
        ) : null;
      })()}

      <p className={hintClassName} aria-live="polite">
        {listQuery.isLoading
          ? t("ui.loading")
          : t("assets.list.count", { count: total, shown: items.length })}
      </p>

      {listQuery.error ? (
        <EntityListQueryError
          messageKey={mapAssetError(listQuery.error) ?? mapApiError(listQuery.error)}
          requestId={readApiRequestId(listQuery.error)}
          retrying={listQuery.isFetching}
          onRetry={() =>
            void (listQuery.isFetchNextPageError ? listQuery.fetchNextPage() : listQuery.refetch())
          }
        />
      ) : null}

      {canManage && selected.size > 0 ? (
        <div
          role="region"
          aria-label={t("assets.bulk.region")}
          className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-[12.5px]"
        >
          <span className="font-medium text-foreground">
            {t("assets.bulk.selectedCount", { count: selected.size })}
          </span>
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
          {bulkPlan.kind === "mixed" ? (
            <span className={hintClassName}>{t("assets.bulk.mixed")}</span>
          ) : null}
          {bulkPlan.kind === "too_many" ? (
            <span className={hintClassName}>
              {t("assets.bulk.tooMany", { max: assetBulkMoveMax })}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setSelected(new Map())}
          >
            {t("assets.bulk.clear")}
          </Button>
        </div>
      ) : null}

      {listState === "loading" ? (
        <PanelSkeleton label={t("ui.loading")} />
      ) : listState === "error" ? null : listState === "empty" ? (
        <EmptyState
          icon={<Boxes size={18} />}
          title={hasFilters ? t("assets.list.noMatchesTitle") : t("assets.list.emptyTitle")}
          body={hasFilters ? t("assets.list.noMatchesBody") : t("assets.list.emptyBody")}
        />
      ) : (
        <AssetRegisterTable
          items={items}
          canManage={canManage}
          selected={selected}
          locationsEnabled={locationsEnabled}
          onToggleSelected={toggleSelected}
          pageSelected={pageSelected}
          onTogglePage={togglePage}
        />
      )}

      {listQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void listQuery.fetchNextPage()}
            disabled={listQuery.isFetchingNextPage}
          >
            {listQuery.isFetchingNextPage ? t("ui.loading") : t("assets.list.loadMore")}
          </Button>
        </div>
      ) : null}

      <AssetRegisterActions
        canManage={canManage}
        bulkPlan={bulkPlan}
        bulkSheet={bulkSheet}
        onBulkSheetChange={setBulkSheet}
        onBulkDone={bulkDone}
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
        catalog={catalogQuery.data}
        options={optionsQuery.data}
        onCreated={(id) => {
          void invalidateEntityQueries(queryClient, entityMutationQueryKeys.assets.records);
          navigate(`/assets/${id}`);
        }}
      />
    </div>
  );
}
