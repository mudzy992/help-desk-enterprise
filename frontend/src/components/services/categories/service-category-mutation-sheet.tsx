import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ServiceCategoryMutationForm,
  type ServiceCategoryMutationValues,
} from "@/components/services/categories/service-category-mutation-form";
import { errorTextClassName } from "@/components/ui/control";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  mapServiceCategoryError,
  type ServiceCategoryErrorKey,
} from "@/lib/services/map-service-category-error";
import {
  createServiceCategory,
  updateServiceCategory,
  type ServiceCategoryResponse,
} from "@/services/service-categories-api";

interface ServiceCategoryMutationSheetProperties {
  readonly open: boolean;
  readonly category: ServiceCategoryResponse | null;
  readonly categories: readonly ServiceCategoryResponse[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => Promise<void>;
}

export function ServiceCategoryMutationSheet({
  open,
  category,
  categories,
  onOpenChange,
  onSaved,
}: ServiceCategoryMutationSheetProperties) {
  const { t } = useTranslation();
  const isCreate = category === null;
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ServiceCategoryErrorKey | null>(null);

  const save = async (values: ServiceCategoryMutationValues) => {
    setIsSaving(true);
    setErrorKey(null);
    try {
      if (isCreate) {
        await createServiceCategory({
          name: values.name,
          slug: values.slug,
          sortOrder: values.sortOrder,
          parentId: values.parentId,
        });
      } else if (category !== null) {
        await updateServiceCategory(category.id, {
          name: values.name,
          sortOrder: values.sortOrder,
          parentId: values.parentId,
        });
      }
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      setErrorKey(mapServiceCategoryError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>
          {t(isCreate ? "services.categories.create" : "services.categories.edit")}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("services.categories.intro")}
        </SheetDescription>
        {open ? (
          <ServiceCategoryMutationForm
            key={category?.id ?? "create"}
            category={category}
            categories={categories}
            isSaving={isSaving}
            errorKey={errorKey}
            onCancel={() => onOpenChange(false)}
            onSubmit={(values) => {
              void save(values);
            }}
          />
        ) : (
          <p className={errorTextClassName}>{errorKey ? t(errorKey) : null}</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
