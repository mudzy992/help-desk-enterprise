import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { EmptyState } from "@/components/ui/empty-state";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  mapServiceCategoryError,
  type ServiceCategoryErrorKey,
} from "@/lib/services/map-service-category-error";
import {
  deleteServiceCategory,
  type ServiceCategoryResponse,
} from "@/services/service-categories-api";

interface ServiceCategoriesPanelProperties {
  readonly categories: readonly ServiceCategoryResponse[];
  readonly canWrite: boolean;
  readonly onCreate: () => void;
  readonly onEdit: (category: ServiceCategoryResponse) => void;
  readonly onChanged: () => Promise<void>;
}

export function ServiceCategoriesPanel({
  categories,
  canWrite,
  onCreate,
  onEdit,
  onChanged,
}: ServiceCategoriesPanelProperties) {
  const { t } = useTranslation();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<ServiceCategoryErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const remove = async (categoryId: string) => {
    setPendingId(categoryId);
    setErrorKey(null);
    setRequestId(null);
    try {
      await deleteServiceCategory(categoryId);
      setConfirmId(null);
      await onChanged();
    } catch (error) {
      setErrorKey(mapServiceCategoryError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setPendingId(null);
    }
  };

  if (categories.length === 0) {
    return (
      <EmptyState
        title={t("services.categories.emptyTitle")}
        body={t("services.categories.emptyBody")}
        action={
          canWrite ? (
            <Button type="button" size="sm" onClick={onCreate}>
              <Plus size={14} />
              {t("services.categories.create")}
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="fade-in grid gap-3">
      {errorKey ? (
        <ApiErrorText messageKey={errorKey} requestId={requestId} />
      ) : null}
      {categories.map((category) => {
        const parent = categories.find((item) => item.id === category.parentId);
        return (
          <Card key={category.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[13.5px] font-semibold text-foreground">{category.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {category.slug}
                  {parent ? ` · ${parent.name}` : ""}
                </p>
              </div>
              {canWrite ? (
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="xs" variant="outline" onClick={() => onEdit(category)}>
                    {t("services.categories.edit")}
                  </Button>
                  {confirmId === category.id ? (
                    <>
                      <Button
                        type="button"
                        size="xs"
                        variant="danger"
                        disabled={pendingId !== null}
                        onClick={() => void remove(category.id)}
                      >
                        {pendingId === category.id
                          ? t("services.categories.deleting")
                          : t("services.categories.confirmDelete")}
                      </Button>
                      <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmId(null)}>
                        {t("services.cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="xs"
                      variant="danger"
                      onClick={() => setConfirmId(category.id)}
                    >
                      {t("services.categories.delete")}
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
