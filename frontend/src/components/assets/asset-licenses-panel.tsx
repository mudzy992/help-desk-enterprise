import { LicenseDetailSheet } from "./asset-license-detail-sheet";
import { useCommercialSearch } from "./use-commercial-search";
import { LicenseFormSheet } from "./asset-license-form-sheet";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { KeyRound, Plus } from "lucide-react";
import { AssetExpiryBadge } from "@/components/assets/asset-expiry-badge";
import { Badge } from "@/components/ui/badge";
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
  assetContractQueryKeys,
  listLicenses,
  softwareLicenseKinds,
  type SoftwareLicenseItem,
  type SoftwareLicenseKind,
} from "@/services/assets-api";

/** Delivery invariant (requirement): licence register with compliance (used / seats). */
export function AssetLicensesPanel({ canManage }: { readonly canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const search = useCommercialSearch(searchText);
  const [kind, setKind] = useState<SoftwareLicenseKind | "">("");
  const [expiring, setExpiring] = useState(false);
  const [overAllocated, setOverAllocated] = useState(false);
  const [editing, setEditing] = useState<SoftwareLicenseItem | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      kind: kind || undefined,
      expiringWithinDays: expiring ? 60 : undefined,
      overAllocated: overAllocated || undefined,
    }),
    [search, kind, expiring, overAllocated],
  );
  const listQuery = useQuery({
    queryKey: assetContractQueryKeys.licenses(filters),
    queryFn: () => listLicenses(filters),
    retry: false,
  });
  const items = listQuery.data?.items ?? [];

  return (
    <div className="grid gap-3">
      <FilterBar
        label={t("assets.licenses.filtersLabel")}
        searchLabel={t("assets.licenses.searchLabel")}
        searchPlaceholder={t("assets.licenses.searchPlaceholder")}
        searchValue={searchText}
        onSearchChange={setSearchText}
        activeCount={[kind, expiring, overAllocated].filter(Boolean).length}
        onReset={() => {
          setSearchText("");
          setKind("");
          setExpiring(false);
          setOverAllocated(false);
        }}
        actions={
          <>
            {canManage ? (
              <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
                <Plus size={14} aria-hidden="true" />
                {t("assets.licenses.create")}
              </Button>
            ) : null}
          </>
        }
      >
        <FilterField label={t("assets.licenses.fields.kind")}>
          <select
            className={`${selectCompactClassName} w-full`}
            aria-label={t("assets.licenses.fields.kind")}
            value={kind}
            onChange={(event) => setKind(event.target.value as SoftwareLicenseKind | "")}
          >
            <option value="">{t("assets.licenses.allKinds")}</option>
            {softwareLicenseKinds.map((value) => (
              <option key={value} value={value}>
                {t(`assets.licenses.kinds.${value}` as const)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterToggles label={t("ui.filters.options")}>
          <Checkbox
            label={t("assets.licenses.expiringFilter")}
            checked={expiring}
            onChange={(event) => setExpiring(event.target.checked)}
          />
          <Checkbox
            label={t("assets.licenses.overAllocatedFilter")}
            checked={overAllocated}
            onChange={(event) => setOverAllocated(event.target.checked)}
          />
        </FilterToggles>
      </FilterBar>

      {listQuery.error ? (
        <p role="alert" className={errorTextClassName}>
          {t(mapAssetError(listQuery.error) ?? mapApiError(listQuery.error))}
        </p>
      ) : null}

      {listQuery.isLoading ? (
        <PanelSkeleton label={t("ui.loading")} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<KeyRound size={18} />}
          title={t("assets.licenses.emptyTitle")}
          body={t("assets.licenses.emptyBody")}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">{t("assets.licenses.caption")}</caption>
              <thead>
                <tr className={tableHeadClassName}>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t("assets.licenses.fields.productName")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t("assets.licenses.fields.kind")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t("assets.licenses.fields.usage")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t("assets.licenses.fields.validUntil")}
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
                        {item.productName}
                      </button>
                      {item.vendor ? (
                        <span className="block text-[11.5px] text-muted-foreground">
                          {item.vendor}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {t(`assets.licenses.kinds.${item.kind}` as const)}
                    </td>
                    <td className="px-3 py-2">
                      {item.seats === null ? (
                        t("assets.licenses.usageUnlimited", { used: item.used })
                      ) : (
                        <span className="flex items-center gap-1.5">
                          {t("assets.licenses.usage", { used: item.used, seats: item.seats })}
                          {item.overAllocated ? (
                            <Badge tone="danger">{t("assets.licenses.overAllocated")}</Badge>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {formatAssetDate(item.validUntil, i18n.language)}
                        <AssetExpiryBadge daysLeft={item.daysLeft} />
                      </span>
                    </td>
                    <td className="px-3 py-2">{item.organizationalUnit.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <LicenseFormSheet
        open={editing !== null}
        license={editing === "new" ? null : editing}
        onOpenChange={(open) => (open ? undefined : setEditing(null))}
      />
      <LicenseDetailSheet
        licenseId={openId}
        canManage={canManage}
        onOpenChange={(open) => (open ? undefined : setOpenId(null))}
        onEdit={(license) => {
          setOpenId(null);
          setEditing(license);
        }}
      />
    </div>
  );
}
