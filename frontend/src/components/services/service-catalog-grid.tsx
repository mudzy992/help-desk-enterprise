import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ServiceCatalogCard } from "@/components/services/service-catalog-card";
import { ServiceCatalogCategoryChips } from "@/components/services/service-catalog-category-chips";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import type { CatalogCoverageNote } from "@/lib/services/catalog-coverage-note";
import { filterServiceCatalogRows } from "@/lib/services/filter-service-catalog-rows";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface ServiceCatalogGridProperties {
  readonly rows: readonly ServiceCatalogRow[];
  readonly categories: readonly ServiceCategoryResponse[];
  readonly coverageByServiceId: ReadonlyMap<string, CatalogCoverageNote>;
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
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const visibleRows = useMemo(
    () => filterServiceCatalogRows(rows, query, categoryId),
    [categoryId, query, rows],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const isQueryActive = query.trim().length > 0 || categoryId !== null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <ServiceCatalogCategoryChips
          categories={categories}
          rows={rows}
          activeCategoryId={categoryId}
          canWrite={canWriteCatalog}
          onChange={setCategoryId}
          onManage={onManageCategories}
        />
        <div className="relative ml-auto w-60 max-w-full">
          <Search
            size={13.5}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("services.searchPlaceholder")}
            aria-label={t("services.searchPlaceholder")}
            className="h-8 pl-8 pr-3 text-[12.5px]"
          />
        </div>
      </div>
      {visibleRows.length === 0 ? (
        <EmptyState
          title={
            isQueryActive ? t("services.searchEmptyTitle") : t("services.emptyTitle")
          }
          body={
            isQueryActive ? t("services.searchEmptyBody") : t("services.emptyBody")
          }
          action={
            isQueryActive ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setCategoryId(null);
                }}
              >
                {t("services.clearSearch")}
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
