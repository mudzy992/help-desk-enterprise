import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ServiceCatalogCategoryChips } from "@/components/services/service-catalog-category-chips";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { CatalogOriginUnitOption } from "@/lib/services/catalog-routing-index";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";
import type { ServiceLifecycle } from "@/services/service-catalog-api";

interface ServiceCatalogFilterBarProperties {
  readonly categories: readonly ServiceCategoryResponse[];
  readonly rows: readonly ServiceCatalogRow[];
  readonly activeCategoryId: string | null;
  readonly query: string;
  readonly lifecycle: ServiceLifecycle | "ALL";
  readonly originUnitId: string | null;
  readonly originUnits: readonly CatalogOriginUnitOption[];
  readonly canWriteCatalog: boolean;
  readonly hasRoutingCoverage: boolean;
  readonly isRoutingCoverageLoading: boolean;
  readonly hasActiveFilters: boolean;
  readonly resultCount: string;
  readonly onCategoryChange: (categoryId: string | null) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onLifecycleChange: (lifecycle: ServiceLifecycle | "ALL") => void;
  readonly onOriginUnitChange: (originUnitId: string | null) => void;
  readonly onManageCategories: () => void;
  readonly onClearFilters: () => void;
}

export function ServiceCatalogFilterBar({
  categories,
  rows,
  activeCategoryId,
  query,
  lifecycle,
  originUnitId,
  originUnits,
  canWriteCatalog,
  hasRoutingCoverage,
  isRoutingCoverageLoading,
  hasActiveFilters,
  resultCount,
  onCategoryChange,
  onQueryChange,
  onLifecycleChange,
  onOriginUnitChange,
  onManageCategories,
  onClearFilters,
}: ServiceCatalogFilterBarProperties) {
  const { t } = useTranslation();

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <ServiceCatalogCategoryChips
          categories={categories}
          rows={rows}
          activeCategoryId={activeCategoryId}
          canWrite={canWriteCatalog}
          onChange={onCategoryChange}
          onManage={onManageCategories}
        />
        <div className="relative w-full sm:ml-auto sm:w-60">
          <Search
            size={13.5}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("services.searchPlaceholder")}
            aria-label={t("services.searchPlaceholder")}
            className="h-8 pl-8 pr-3 text-[12.5px]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("services.filterLifecycle")} className="min-w-[155px] flex-1 sm:max-w-[220px]">
          {(control) => (
            <Select
              {...control}
              value={lifecycle}
              onChange={(event) =>
                onLifecycleChange(event.target.value as ServiceLifecycle | "ALL")
              }
              className="h-8"
            >
              <option value="ALL">{t("services.filterAllLifecycles")}</option>
              <option value="DRAFT">{t("services.lifecycle.DRAFT")}</option>
              <option value="ACTIVE">{t("services.lifecycle.ACTIVE")}</option>
              <option value="DEPRECATED">{t("services.lifecycle.DEPRECATED")}</option>
            </Select>
          )}
        </Field>

        {hasRoutingCoverage || isRoutingCoverageLoading ? (
          <Field
            label={t("services.filterOriginUnit")}
            hint={t("services.filterOriginUnitHint")}
            className="min-w-[200px] flex-1 sm:max-w-[340px]"
          >
            {(control) => (
              <Select
                {...control}
                value={originUnitId ?? ""}
                disabled={isRoutingCoverageLoading || !hasRoutingCoverage}
                onChange={(event) => onOriginUnitChange(event.target.value || null)}
                className="h-8"
              >
                <option value="">{t("services.filterAllOriginUnits")}</option>
                {originUnits.map((origin) => (
                  <option key={origin.id} value={origin.id}>
                    {origin.path}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasActiveFilters}
          onClick={onClearFilters}
        >
          {t("services.clearFilters")}
        </Button>
        <span className="min-h-8 flex-1 content-center text-right text-[11.5px] text-muted-foreground">
          {resultCount}
        </span>
      </div>
    </div>
  );
}
