import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ServiceCatalogMutationForm,
  type ServiceCatalogMutationValues,
} from "@/components/services/service-catalog-mutation-form";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  mapServiceCatalogError,
  type ServiceCatalogErrorKey,
} from "@/lib/services/map-service-catalog-error";
import {
  createService,
  listServiceCategories,
  updateService,
  type ServiceCategoryResponse,
  type ServiceResponse,
} from "@/services/service-catalog-api";

interface ServiceCatalogMutationSheetProperties {
  readonly open: boolean;
  readonly service: ServiceResponse | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => Promise<void>;
}

export function ServiceCatalogMutationSheet({
  open,
  service,
  onOpenChange,
  onSaved,
}: ServiceCatalogMutationSheetProperties) {
  const { t } = useTranslation();
  const isCreate = service === null;
  const [categories, setCategories] = useState<readonly ServiceCategoryResponse[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ServiceCatalogErrorKey | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setErrorKey(null);
    void listServiceCategories()
      .then((loaded) => {
        if (!cancelled) {
          setCategories(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCategories([]);
          setErrorKey(mapServiceCatalogError(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const save = async (values: ServiceCatalogMutationValues) => {
    setIsSaving(true);
    setErrorKey(null);
    try {
      if (isCreate) {
        await createService({
          name: values.name,
          slug: values.slug,
          categoryId: values.categoryId,
          requiresApproval: values.requiresApproval,
        });
      } else if (service !== null) {
        await updateService(service.id, {
          name: values.name,
          categoryId: values.categoryId,
          requiresApproval: values.requiresApproval,
        });
      }
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      setErrorKey(mapServiceCatalogError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>
          {t(isCreate ? "services.createService" : "services.editService")}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("services.mutationHint")}
        </SheetDescription>
        {isLoading ? (
          <PanelSkeleton className="mt-4" label={t("services.category")} />
        ) : errorKey && categories.length === 0 ? (
          <p className={`mt-4 ${errorTextClassName}`}>{t(errorKey)}</p>
        ) : (
          <ServiceCatalogMutationForm
            key={service?.id ?? "create"}
            service={service}
            categories={categories}
            isSaving={isSaving}
            errorKey={errorKey}
            onCancel={() => onOpenChange(false)}
            onSubmit={(values) => {
              void save(values);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
