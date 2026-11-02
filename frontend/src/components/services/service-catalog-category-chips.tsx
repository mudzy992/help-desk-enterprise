import { useTranslation } from "react-i18next";
import { ServiceCategoryChip } from "@/components/services/service-category-chip";
import { Button } from "@/components/ui/button";
import { countServicesInCategory } from "@/lib/services/filter-service-catalog-rows";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";

interface ServiceCatalogCategoryChipsProperties {
  readonly categories: readonly ServiceCategoryResponse[];
  readonly rows: readonly ServiceCatalogRow[];
  readonly activeCategoryId: string | null;
  readonly showCounts: boolean;
  readonly totalCount: number;
  readonly canWrite: boolean;
  readonly onChange: (categoryId: string | null) => void;
  readonly onManage: () => void;
}

export function ServiceCatalogCategoryChips({
  categories,
  rows,
  activeCategoryId,
  showCounts,
  totalCount,
  canWrite,
  onChange,
  onManage,
}: ServiceCatalogCategoryChipsProperties) {
  const { t } = useTranslation();
  return (
    <div className="fade-in flex flex-wrap items-center gap-1.5">
      <ServiceCategoryChip
        label={t("services.allCategories")}
        count={showCounts ? totalCount : undefined}
        active={activeCategoryId === null}
        onClick={() => onChange(null)}
      />
      {categories.map((category) => (
        <ServiceCategoryChip
          key={category.id}
          label={category.name}
          count={showCounts ? countServicesInCategory(rows, category.id) : undefined}
          active={activeCategoryId === category.id}
          onClick={() => onChange(category.id)}
        />
      ))}
      {canWrite ? (
        <Button type="button" size="xs" variant="ghost" onClick={onManage}>
          {t("services.tabCategories")}
        </Button>
      ) : null}
    </div>
  );
}
