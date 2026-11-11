import { ContractDetailSheet } from "./asset-contract-detail-sheet";
import { useCommercialSearch } from "./use-commercial-search";
import { ContractFormSheet } from "./asset-contract-form-sheet";
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, Plus } from "lucide-react";
import { AssetExpiryBadge } from "@/components/assets/asset-expiry-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterBar, FilterField, FilterToggles } from "@/components/ui/filter-bar";
import {
  errorTextClassName,
  selectCompactClassName,
  tableHeadClassName,
  tableRowClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { formatAssetDate, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  assetContractKinds,
  assetContractQueryKeys,
  listContracts,
  type AssetContractItem,
  type AssetContractKind,
} from "@/services/assets-api";

/** Delivery invariant (requirement): warranty, support, lease and maintenance contracts. */
export function AssetContractsPanel({ canManage }: { readonly canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const search = useCommercialSearch(searchText);
  const [kind, setKind] = useState<AssetContractKind | "">("");
  const [expiring, setExpiring] = useState(false);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [editing, setEditing] = useState<AssetContractItem | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      kind: kind || undefined,
      expiringWithinDays: expiring ? 60 : undefined,
      includeExpired: includeExpired || undefined,
    }),
    [search, kind, expiring, includeExpired],
  );
  const listQuery = useInfiniteQuery({
    queryKey: assetContractQueryKeys.contracts(filters),
    queryFn: ({ pageParam }) => listContracts({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="grid gap-3">
      <FilterBar
        label={t("assets.contracts.filtersLabel")}
        searchLabel={t("assets.contracts.searchLabel")}
        searchPlaceholder={t("assets.contracts.searchPlaceholder")}
        searchValue={searchText}
        onSearchChange={setSearchText}
        activeCount={[kind, expiring, includeExpired].filter(Boolean).length}
        onReset={() => {
          setSearchText("");
          setKind("");
          setExpiring(false);
          setIncludeExpired(false);
        }}
        actions={
          <>
            {canManage ? (
              <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
                <Plus size={14} aria-hidden="true" />
                {t("assets.contracts.create")}
              </Button>
            ) : null}
          </>
        }
      >
        <FilterField label={t("assets.contracts.fields.kind")}>
          <select
            className={`${selectCompactClassName} w-full`}
            aria-label={t("assets.contracts.fields.kind")}
            value={kind}
            onChange={(event) => setKind(event.target.value as AssetContractKind | "")}
          >
            <option value="">{t("assets.contracts.allKinds")}</option>
            {assetContractKinds.map((value) => (
              <option key={value} value={value}>
                {t(`assets.contracts.kinds.${value}` as const)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterToggles label={t("ui.filters.options")}>
          <Checkbox
            label={t("assets.contracts.expiringFilter")}
            checked={expiring}
            onChange={(event) => setExpiring(event.target.checked)}
          />
          <Checkbox
            label={t("assets.contracts.includeExpired")}
            checked={includeExpired}
            onChange={(event) => setIncludeExpired(event.target.checked)}
          />
        </FilterToggles>
      </FilterBar>

      {listQuery.error ? (
        <p role="alert" className={errorTextClassName}>
          {t(mapAssetError(listQuery.error) ?? mapApiError(listQuery.error))}
        </p>
      ) : null}

      {listQuery.isLoading ? <PanelSkeleton label={t("ui.loading")} /> : null}
      {!listQuery.isLoading && items.length === 0 && !listQuery.hasNextPage ? (
        <EmptyState
          icon={<FileText size={18} />}
          title={t("assets.contracts.emptyTitle")}
          body={t("assets.contracts.emptyBody")}
        />
      ) : null}
      {items.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">{t("assets.contracts.caption")}</caption>
              <thead>
                <tr className={tableHeadClassName}>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t("assets.contracts.fields.supplier")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t("assets.contracts.fields.kind")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t("assets.contracts.fields.endsAt")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    {t("assets.contracts.fields.items")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t("assets.fields.organizationalUnit")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={tableRowClassName}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left text-foreground underline-offset-2 hover:underline"
                        onClick={() => setOpenId(item.id)}
                      >
                        {item.supplier}
                      </button>
                      {item.reference ? (
                        <span className="block text-[11.5px] text-muted-foreground">
                          {item.reference}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {t(`assets.contracts.kinds.${item.kind}` as const)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {formatAssetDate(item.endsAt, i18n.language)}
                        <AssetExpiryBadge daysLeft={item.daysLeft} />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.itemCount}</td>
                    <td className="px-3 py-2">{item.organizationalUnit.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {listQuery.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-center"
          disabled={listQuery.isFetchingNextPage}
          onClick={() => void listQuery.fetchNextPage()}
        >
          {listQuery.isFetchingNextPage ? t("ui.loading") : t("assets.list.loadMore")}
        </Button>
      ) : null}

      <ContractFormSheet
        open={editing !== null}
        contract={editing === "new" ? null : editing}
        onOpenChange={(open) => (open ? undefined : setEditing(null))}
      />
      <ContractDetailSheet
        contractId={openId}
        canManage={canManage}
        onOpenChange={(open) => (open ? undefined : setOpenId(null))}
        onEdit={(contract) => {
          setOpenId(null);
          setEditing(contract);
        }}
      />
    </div>
  );
}
