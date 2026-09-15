import { useTranslation } from "react-i18next";
import { ServiceCategoriesPanel } from "@/components/services/categories/service-categories-panel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";

interface ServiceCategoriesAdminSheetProperties {
  readonly open: boolean;
  readonly categories: readonly ServiceCategoryResponse[];
  readonly canWrite: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreate: () => void;
  readonly onEdit: (category: ServiceCategoryResponse) => void;
  readonly onChanged: () => Promise<void>;
}

export function ServiceCategoriesAdminSheet({
  open,
  categories,
  canWrite,
  onOpenChange,
  onCreate,
  onEdit,
  onChanged,
}: ServiceCategoriesAdminSheetProperties) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col overflow-y-auto p-5">
        <SheetTitle>{t("services.categories.heading")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("services.categories.intro")}
        </SheetDescription>
        {canWrite ? (
          <div className="my-3">
            <Button type="button" size="sm" onClick={onCreate}>
              {t("services.categories.create")}
            </Button>
          </div>
        ) : null}
        <ServiceCategoriesPanel
          categories={categories}
          canWrite={canWrite}
          onCreate={onCreate}
          onEdit={onEdit}
          onChanged={onChanged}
        />
      </SheetContent>
    </Sheet>
  );
}
