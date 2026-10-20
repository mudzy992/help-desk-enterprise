import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ServiceCatalogFilterBar } from "@/components/services/service-catalog-filter-bar";
import { ServiceCatalogTable } from "@/components/services/service-catalog-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { numberFormatter } from "@/lib/number-formatter";
import type { CatalogCoverageNote } from "@/lib/services/catalog-coverage-note";
import { filterServiceCatalogRows } from "@/lib/services/filter-service-catalog-rows";
import {
  parseServiceCatalogUrl,
  updateServiceCatalogUrl,
} from "@/lib/services/service-catalog-url-state";
import type { CatalogRoutingCoverageState } from "@/lib/services/use-catalog-routing-coverage";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";
import type { ServiceResponse } from "@/services/service-catalog-api";
import type { ServiceOnboardingResponse } from "@/services/service-onboarding-api";

interface ServiceCatalogListProperties {
  readonly rows: readonly ServiceCatalogRow[];
  readonly categories: readonly ServiceCategoryResponse[];
  readonly onboardings: readonly ServiceOnboardingResponse[];
  readonly coverageByServiceId: ReadonlyMap<string, CatalogCoverageNote>;
  readonly routingCoverage: CatalogRoutingCoverageState;
  readonly canManageForms: boolean;
  readonly canWriteCatalog: boolean;
  readonly canWriteAvailability: boolean;
  readonly onPrepareForm: (serviceId: string) => void;
  readonly onCreate: () => void;
  readonly onEdit: (service: ServiceResponse) => void;
  readonly onStartOnboarding: (serviceId: string) => void;
  readonly onManageCategories: () => void;
  readonly onManageDowntime: (service: ServiceResponse) => void;
  readonly onManageLifecycle: (service: ServiceResponse) => void;
}

export function ServiceCatalogList({
  rows,
  categories,
  onboardings,
  coverageByServiceId,
  routingCoverage,
  canManageForms,
  canWriteCatalog,
  canWriteAvailability,
  onPrepareForm,
  onCreate,
  onEdit,
  onStartOnboarding,
  onManageCategories,
  onManageDowntime,
  onManageLifecycle,
}: ServiceCatalogListProperties) {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { query, categoryId, lifecycle, originUnitId } = useMemo(
    () => parseServiceCatalogUrl(searchParams),
    [searchParams],
  );
  const patchFilters = (patch: Parameters<typeof updateServiceCatalogUrl>[1]) => {
    setSearchParams((current) => updateServiceCatalogUrl(current, patch));
  };
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const onboardingByServiceId = useMemo(
    () => new Map(onboardings.map((onboarding) => [onboarding.serviceId, onboarding])),
    [onboardings],
  );
  const visibleRows = useMemo(
    () =>
      filterServiceCatalogRows(rows, {
        query,
        categoryId,
        lifecycle: lifecycle === "ALL" ? null : lifecycle,
        originUnitId,
        categoryNames,
        serviceIdsWithExactRuleByOriginUnit: routingCoverage.serviceIdsWithExactRuleByOriginUnit,
      }),
    [
      categoryId,
      categoryNames,
      lifecycle,
      originUnitId,
      query,
      routingCoverage.serviceIdsWithExactRuleByOriginUnit,
      rows,
    ],
  );
  const hasActiveFilters =
    query.trim().length > 0 || categoryId !== null || lifecycle !== "ALL" || originUnitId !== null;
  const numberFormat = numberFormatter(i18n.language, { maximumFractionDigits: 0 });

  useEffect(() => {
    if (!routingCoverage.isLoading && !routingCoverage.isAvailable) {
      setSearchParams((current) => updateServiceCatalogUrl(current, { originUnitId: null }));
      return;
    }
    if (
      !routingCoverage.isLoading &&
      originUnitId !== null &&
      !routingCoverage.originUnits.some((origin) => origin.id === originUnitId)
    ) {
      setSearchParams((current) => updateServiceCatalogUrl(current, { originUnitId: null }));
    }
  }, [
    originUnitId,
    routingCoverage.isAvailable,
    routingCoverage.isLoading,
    routingCoverage.originUnits,
    setSearchParams,
  ]);

  const clearFilters = () => {
    patchFilters({ query: "", categoryId: null, lifecycle: "ALL", originUnitId: null });
  };

  return (
    <div>
      <ServiceCatalogFilterBar
        categories={categories}
        rows={rows}
        activeCategoryId={categoryId}
        query={query}
        lifecycle={lifecycle}
        originUnitId={originUnitId}
        originUnits={routingCoverage.originUnits}
        canWriteCatalog={canWriteCatalog}
        hasRoutingCoverage={routingCoverage.isAvailable}
        isRoutingCoverageLoading={routingCoverage.isLoading}
        hasActiveFilters={hasActiveFilters}
        resultCount={t("services.resultsCount", {
          visible: numberFormat.format(visibleRows.length),
          total: numberFormat.format(rows.length),
        })}
        onCategoryChange={(value) => patchFilters({ categoryId: value })}
        onQueryChange={(value) => patchFilters({ query: value })}
        onLifecycleChange={(value) => patchFilters({ lifecycle: value })}
        onOriginUnitChange={(value) => patchFilters({ originUnitId: value })}
        onManageCategories={onManageCategories}
        onClearFilters={clearFilters}
      />
      {visibleRows.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? t("services.searchEmptyTitle") : t("services.emptyTitle")}
          body={hasActiveFilters ? t("services.searchEmptyBody") : t("services.emptyBody")}
          action={
            hasActiveFilters ? (
              <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                {t("services.clearFilters")}
              </Button>
            ) : canWriteCatalog ? (
              <Button type="button" size="sm" onClick={onCreate}>
                {t("services.createService")}
              </Button>
            ) : null
          }
        />
      ) : (
        <ServiceCatalogTable
          rows={visibleRows}
          categoryNames={categoryNames}
          coverageByServiceId={coverageByServiceId}
          onboardingByServiceId={onboardingByServiceId}
          canManageForms={canManageForms}
          canWriteCatalog={canWriteCatalog}
          canWriteAvailability={canWriteAvailability}
          onPrepareForm={onPrepareForm}
          onEdit={onEdit}
          onStartOnboarding={onStartOnboarding}
          onManageDowntime={onManageDowntime}
          onManageLifecycle={onManageLifecycle}
        />
      )}
    </div>
  );
}
