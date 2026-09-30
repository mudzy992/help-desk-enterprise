import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Boxes, Plus, Search } from "lucide-react";
import { AssetCatalogManager } from "@/components/assets/asset-catalog-manager";
import { AssetFormSheet } from "@/components/assets/asset-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  errorTextClassName,
  hintClassName,
  selectCompactClassName,
  controlCompactClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
  ticketIdClassName,
} from "@/components/ui/control";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  assetQueryKeys,
  assetStatuses,
  getAssetCapabilities,
  getAssetCatalog,
  getAssetOptions,
  listAssets,
  type AssetListFilters,
  type AssetSource,
  type AssetStatus,
} from "@/services/assets-api";

const pageSize = 50;
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
  const tab = searchParams.get("tab") === "catalog" ? "catalog" : "register";

  const header = <PageHeader crumbs={[t("navigation.sections.services")]} title={t("assets.title")} subtitle={t("assets.subtitle")} />;

  if (isLoading) {
    return (
      <div>
        {header}
        <PanelSkeleton label={t("ui.loading")} />
      </div>
    );
  }
  if (error || capabilities === undefined || !capabilities.enabled) {
    return (
      <div>
        {header}
        <EmptyState icon={<Boxes size={18} />} title={t("assets.disabledTitle")} body={t("assets.disabledBody")} />
      </div>
    );
  }
  if (!capabilities.canRead) {
    return (
      <div>
        {header}
        <EmptyState icon={<Boxes size={18} />} title={t("assets.forbiddenTitle")} body={t("assets.forbiddenBody")} />
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {header}
      {capabilities.canManageTypes ? (
        <UnderlineTabs
          items={[
            { key: "register", label: t("assets.tabs.register") },
            { key: "catalog", label: t("assets.tabs.catalog") },
          ]}
          active={tab}
          onChange={(key) => setSearchParams(key === "catalog" ? { tab: "catalog" } : {}, { replace: true })}
        />
      ) : null}
      {capabilities.canManageTypes && tab === "catalog" ? <AssetCatalogManager /> : <AssetRegister canManage={capabilities.canManage} />}
    </div>
  );
}

function AssetRegister({ canManage }: { readonly canManage: boolean }) {
  const { t, i18n } = useTranslation();
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
  const hasFilters = Boolean(search || typeId || status || organizationalUnitId || locationId || source || warrantyExpiring || unassigned);

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

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t("assets.list.filtersLabel")}>
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            className={`${controlCompactClassName} w-full pl-8`}
            placeholder={t("assets.list.searchPlaceholder")}
            aria-label={t("assets.list.searchLabel")}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <select className={selectCompactClassName} aria-label={t("assets.fields.type")} value={typeId} onChange={(event) => setTypeId(event.target.value)}>
          <option value="">{t("assets.list.allTypes")}</option>
          {(catalogQuery.data?.types ?? []).map((type) => (
            <option key={type.id} value={type.id}>
              {localizedName(type, i18n.language)}
            </option>
          ))}
        </select>
        <select
          className={selectCompactClassName}
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
        <select
          className={selectCompactClassName}
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
        <select className={selectCompactClassName} aria-label={t("assets.fields.location")} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          <option value="">{t("assets.list.allLocations")}</option>
          {locationRows.map((row) => (
            <option key={row.location.id} value={row.location.id}>
              {row.path}
            </option>
          ))}
        </select>
        <select
          className={selectCompactClassName}
          aria-label={t("assets.fields.source")}
          value={source}
          onChange={(event) => setSource(event.target.value as AssetSource | "")}
        >
          <option value="">{t("assets.list.allSources")}</option>
          <option value="MANUAL">{t("assets.source.MANUAL")}</option>
          <option value="IMPORT">{t("assets.source.IMPORT")}</option>
          <option value="DIRECTORY">{t("assets.source.DIRECTORY")}</option>
        </select>
        <Checkbox label={t("assets.list.warrantyExpiring")} checked={warrantyExpiring} onChange={(event) => setWarrantyExpiring(event.target.checked)} />
        <Checkbox label={t("assets.list.unassigned")} checked={unassigned} onChange={(event) => setUnassigned(event.target.checked)} />
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            {t("assets.list.resetFilters")}
          </Button>
        ) : null}
        {canManage ? (
          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            onClick={() => setCreateOpen(true)}
            disabled={catalogQuery.data === undefined || optionsQuery.data === undefined}
          >
            <Plus size={14} aria-hidden="true" />
            {t("assets.list.create")}
          </Button>
        ) : null}
      </div>

      <p className={hintClassName} aria-live="polite">
        {listQuery.isLoading ? t("ui.loading") : t("assets.list.count", { count: total, shown: items.length })}
      </p>

      {listQuery.error ? (
        <p role="alert" className={errorTextClassName}>
          {t(mapAssetError(listQuery.error) ?? mapApiError(listQuery.error))}
        </p>
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
          <div className={tableWrapClassName}>
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">{t("assets.list.caption")}</caption>
              <thead>
                <tr className={tableHeadClassName}>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.assetTag")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.name")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.status")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.assignedUser")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.organizationalUnit")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.location")}</th>
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
                      <td className="px-3 py-2">{item.location?.label ?? <span className="text-muted-foreground">—</span>}</td>
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
