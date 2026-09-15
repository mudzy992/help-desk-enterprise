import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ServiceCatalogCard } from "@/components/services/service-catalog-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { filterServiceCatalogRows } from "@/lib/services/filter-service-catalog-rows";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";

interface ServiceCatalogGridProperties {
  readonly rows: readonly ServiceCatalogRow[];
  readonly canManageForms: boolean;
  readonly pendingServiceId: string | null;
  readonly onPrepareForm: (serviceId: string) => void;
}

export function ServiceCatalogGrid({
  rows,
  canManageForms,
  pendingServiceId,
  onPrepareForm,
}: ServiceCatalogGridProperties) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const visibleRows = useMemo(
    () => filterServiceCatalogRows(rows, query),
    [query, rows],
  );
  const isQueryActive = query.trim().length > 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <p className="text-[12px] leading-5 text-muted-foreground">
          {t("services.catalogHint")}
        </p>
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
            isQueryActive
              ? t("services.searchEmptyTitle")
              : t("services.emptyTitle")
          }
          body={
            isQueryActive
              ? t("services.searchEmptyBody")
              : t("services.emptyBody")
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleRows.map((row) => (
            <ServiceCatalogCard
              key={row.service.id}
              row={row}
              canManageForms={canManageForms}
              pendingServiceId={pendingServiceId}
              onPrepareForm={onPrepareForm}
            />
          ))}
        </div>
      )}
    </div>
  );
}
