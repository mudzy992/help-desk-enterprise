import { Blocks, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ServiceCategoriesAdminSheet } from "@/components/services/categories/service-categories-admin-sheet";
import { ServiceCategoryMutationSheet } from "@/components/services/categories/service-category-mutation-sheet";
import { ServiceOnboardingPipelineCard } from "@/components/services/onboarding/service-onboarding-pipeline-card";
import { ServiceOnboardingWizard } from "@/components/services/onboarding/service-onboarding-wizard";
import { ServiceFormBuilderSheet } from "@/components/services/form-builder/service-form-builder-sheet";
import { ServiceCatalogGrid } from "@/components/services/service-catalog-grid";
import { ServiceCatalogMutationSheet } from "@/components/services/service-catalog-mutation-sheet";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { useCatalogCoverageNotes } from "@/lib/services/use-catalog-coverage-notes";
import { useServiceCatalog } from "@/lib/services/use-service-catalog";
import { useServiceCategories } from "@/lib/services/use-service-categories";
import { useVisibleOnboardings } from "@/lib/services/use-visible-onboardings";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

export function ServicesPage() {
  const { t } = useTranslation();
  const catalog = useServiceCatalog();
  const categoryState = useServiceCategories();
  const coverageByServiceId = useCatalogCoverageNotes();
  const onboardings = useVisibleOnboardings(catalog.rows);
  const { hasPermission } = useSessionCapabilities();
  const canWriteCatalog = hasPermission(permissionKeys.serviceCatalogWrite);
  const canManageForms = hasPermission(permissionKeys.serviceFormsWrite);
  const [wizardServiceId, setWizardServiceId] = useState<string | null | undefined>(
    undefined,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceResponse | null>(null);
  const [formServiceId, setFormServiceId] = useState<string | null>(null);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isCategoryCreateOpen, setIsCategoryCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategoryResponse | null>(
    null,
  );
  const categoryNames = useMemo(
    () => new Map(categoryState.categories.map((item) => [item.id, item.name])),
    [categoryState.categories],
  );
  const reloadCategories = async () => {
    await categoryState.reload();
    await catalog.reload();
  };

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.sections.services"), t("services.title")]}
        title={t("services.title")}
        subtitle={t("services.intro")}
        actions={
          canWriteCatalog ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setWizardServiceId(null)}
              >
                <Blocks size={14} />
                {t("services.onboardingWizard")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingService(null);
                  setIsCreateOpen(true);
                }}
              >
                <Plus size={14} />
                {t("services.createService")}
              </Button>
            </>
          ) : null
        }
      />
      {catalog.isLoading || categoryState.isLoading ? (
        <PanelSkeleton className="mt-0" label={t("services.catalogHeading")} />
      ) : catalog.errorKey ? (
        <ApiErrorText messageKey={catalog.errorKey} requestId={catalog.requestId} />
      ) : (
        <>
          <ServiceCatalogGrid
            rows={catalog.rows}
            categories={categoryState.categories}
            coverageByServiceId={coverageByServiceId}
            canManageForms={canManageForms}
            canWriteCatalog={canWriteCatalog}
            pendingServiceId={null}
            onPrepareForm={setFormServiceId}
            onCreate={() => {
              setEditingService(null);
              setIsCreateOpen(true);
            }}
            onEdit={setEditingService}
            onStartOnboarding={setWizardServiceId}
            onManageCategories={() => setIsCategoriesOpen(true)}
            onCatalogChanged={catalog.reload}
          />
          {wizardServiceId !== undefined ? (
            <ServiceOnboardingWizard
              serviceId={wizardServiceId}
              categories={categoryState.categories}
              canWriteForms={canManageForms}
              onClose={() => setWizardServiceId(undefined)}
              onFinished={catalog.reload}
            />
          ) : (
            <ServiceOnboardingPipelineCard
              onboardings={onboardings}
              rows={catalog.rows}
              categoryNames={categoryNames}
              onContinue={setWizardServiceId}
            />
          )}
        </>
      )}
      <ServiceFormBuilderSheet
        serviceId={formServiceId}
        canWrite={canManageForms}
        onOpenChange={(open) => {
          if (!open) {
            setFormServiceId(null);
          }
        }}
        onChanged={catalog.reload}
      />
      <ServiceCatalogMutationSheet
        open={isCreateOpen || editingService !== null}
        service={editingService}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingService(null);
          }
        }}
        onSaved={catalog.reload}
      />
      <ServiceCategoriesAdminSheet
        open={isCategoriesOpen}
        categories={categoryState.categories}
        canWrite={canWriteCatalog}
        onOpenChange={setIsCategoriesOpen}
        onCreate={() => setIsCategoryCreateOpen(true)}
        onEdit={setEditingCategory}
        onChanged={reloadCategories}
      />
      <ServiceCategoryMutationSheet
        open={isCategoryCreateOpen || editingCategory !== null}
        category={editingCategory}
        categories={categoryState.categories}
        onOpenChange={(open) => {
          if (!open) {
            setIsCategoryCreateOpen(false);
            setEditingCategory(null);
          }
        }}
        onSaved={reloadCategories}
      />
    </section>
  );
}
