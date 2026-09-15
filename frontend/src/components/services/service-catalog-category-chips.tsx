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
  readonly canWrite: boolean;
  readonly onChange: (categoryId: string | null) => void;
  readonly onManage: () => void;
}

export function ServiceCatalogCategoryChips({
  categories,
  rows,
  activeCategoryId,
  canWrite,
  onChange,
  onManage,
}: ServiceCatalogCategoryChipsProperties) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ServiceCategoryChip
        label={t("services.allCategories")}
        count={rows.length}
        active={activeCategoryId === null}
        onClick={() => onChange(null)}
      />
      {categories.map((category) => (
        <ServiceCategoryChip
          key={category.id}
          label={category.name}
          count={countServicesInCategory(rows, category.id)}
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
