import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ServiceCatalogCard } from "@/components/services/service-catalog-card";
import { ServiceCatalogFilterBar } from "@/components/services/service-catalog-filter-bar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CatalogCoverageNote } from "@/lib/services/catalog-coverage-note";
import { filterServiceCatalogRows } from "@/lib/services/filter-service-catalog-rows";
import type { CatalogRoutingCoverageState } from "@/lib/services/use-catalog-routing-coverage";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";
import type { ServiceLifecycle, ServiceResponse } from "@/services/service-catalog-api";

interface ServiceCatalogGridProperties {
  readonly rows: readonly ServiceCatalogRow[];
  readonly categories: readonly ServiceCategoryResponse[];
  readonly coverageByServiceId: ReadonlyMap<string, CatalogCoverageNote>;
  readonly routingCoverage: CatalogRoutingCoverageState;
  readonly canManageForms: boolean;
  readonly canWriteCatalog: boolean;
  readonly canWriteAvailability: boolean;
  readonly pendingServiceId: string | null;
  readonly onPrepareForm: (serviceId: string) => void;
  readonly onCreate: () => void;
  readonly onEdit: (service: ServiceResponse) => void;
  readonly onStartOnboarding: (serviceId: string) => void;
  readonly onManageCategories: () => void;
  readonly onManageDowntime: (service: ServiceResponse) => void;
  readonly onCatalogChanged: () => Promise<void>;
}

export function ServiceCatalogGrid({
  rows,
  categories,
  coverageByServiceId,
  routingCoverage,
  canManageForms,
  canWriteCatalog,
  canWriteAvailability,
  pendingServiceId,
  onPrepareForm,
  onCreate,
  onEdit,
  onStartOnboarding,
  onManageCategories,
  onManageDowntime,
  onCatalogChanged,
}: ServiceCatalogGridProperties) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<ServiceLifecycle | "ALL">("ALL");
  const [originUnitId, setOriginUnitId] = useState<string | null>(null);
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const visibleRows = useMemo(
    () =>
      filterServiceCatalogRows(rows, {
        query,
        categoryId,
        lifecycle: lifecycle === "ALL" ? null : lifecycle,
        originUnitId,
        categoryNames,
        serviceIdsWithExactRuleByOriginUnit:
          routingCoverage.serviceIdsWithExactRuleByOriginUnit,
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
    query.trim().length > 0 ||
    categoryId !== null ||
    lifecycle !== "ALL" ||
    originUnitId !== null;
  const numberFormat = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }),
    [i18n.language],
  );

  useEffect(() => {
    if (!routingCoverage.isLoading && !routingCoverage.isAvailable) {
      setOriginUnitId(null);
      return;
    }
    if (
      !routingCoverage.isLoading &&
      originUnitId !== null &&
      !routingCoverage.originUnits.some((origin) => origin.id === originUnitId)
    ) {
      setOriginUnitId(null);
    }
  }, [originUnitId, routingCoverage.isAvailable, routingCoverage.isLoading, routingCoverage.originUnits]);

  const clearFilters = () => {
    setQuery("");
    setCategoryId(null);
    setLifecycle("ALL");
    setOriginUnitId(null);
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
        onCategoryChange={setCategoryId}
        onQueryChange={setQuery}
        onLifecycleChange={setLifecycle}
        onOriginUnitChange={setOriginUnitId}
        onManageCategories={onManageCategories}
        onClearFilters={clearFilters}
      />
      {visibleRows.length === 0 ? (
        <EmptyState
          title={
            hasActiveFilters ? t("services.searchEmptyTitle") : t("services.emptyTitle")
          }
          body={
            hasActiveFilters ? t("services.searchEmptyBody") : t("services.emptyBody")
          }
          action={
            hasActiveFilters ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clearFilters}
              >
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
        <div className="fade-in grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleRows.map((row) => (
            <ServiceCatalogCard
              key={row.service.id}
              row={row}
              categoryName={categoryNames.get(row.service.categoryId) ?? row.service.slug}
              coverage={coverageByServiceId.get(row.service.id) ?? null}
              canManageForms={canManageForms}
              canWriteCatalog={canWriteCatalog}
              canWriteAvailability={canWriteAvailability}
              pendingServiceId={pendingServiceId}
              onPrepareForm={onPrepareForm}
              onEdit={onEdit}
              onStartOnboarding={onStartOnboarding}
              onManageDowntime={onManageDowntime}
              onCatalogChanged={onCatalogChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}
