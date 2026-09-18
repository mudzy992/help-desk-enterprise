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
import { ServiceCatalogReadOnlyBanner } from "@/components/services/service-catalog-read-only-banner";
import { ServiceDowntimeWindowsSheet } from "@/components/services/service-downtime-windows-sheet";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { resolveCatalogWriteFlags, canBypassAdminReadOnly } from "@/lib/services/resolve-catalog-write-flags";
import {
  adminReadOnlyModuleKeys,
  useAdminModuleReadOnly,
} from "@/lib/settings/use-admin-module-read-only";
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
  const { session, hasPermission } = useSessionCapabilities();
  const catalogReadOnly = useAdminModuleReadOnly(
    adminReadOnlyModuleKeys.serviceCatalog,
  );
  const writeFlags = resolveCatalogWriteFlags({
    hasCatalogWrite: hasPermission(permissionKeys.serviceCatalogWrite),
    hasAvailabilityWrite: hasPermission(permissionKeys.serviceAvailabilityWrite),
    hasFormsWrite: hasPermission(permissionKeys.serviceFormsWrite),
    isModuleLocked: catalogReadOnly.isLocked,
    canBypass: canBypassAdminReadOnly(session),
  });
  const [wizardServiceId, setWizardServiceId] = useState<string | null | undefined>(
    undefined,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceResponse | null>(null);
  const [downtimeService, setDowntimeService] = useState<ServiceResponse | null>(null);
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
          writeFlags.canWriteCatalog ? (
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
      <ServiceCatalogReadOnlyBanner visible={catalogReadOnly.isLocked} />
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
            canManageForms={writeFlags.canManageForms}
            canWriteCatalog={writeFlags.canWriteCatalog}
            canWriteAvailability={writeFlags.canWriteAvailability}
            pendingServiceId={null}
            onPrepareForm={setFormServiceId}
            onCreate={() => {
              setEditingService(null);
              setIsCreateOpen(true);
            }}
            onEdit={setEditingService}
            onStartOnboarding={setWizardServiceId}
            onManageCategories={() => setIsCategoriesOpen(true)}
            onManageDowntime={setDowntimeService}
            onCatalogChanged={catalog.reload}
          />
          {wizardServiceId !== undefined ? (
            <ServiceOnboardingWizard
              serviceId={wizardServiceId}
              categories={categoryState.categories}
              canWriteForms={writeFlags.canManageForms}
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
        canWrite={writeFlags.canManageForms}
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
      <ServiceDowntimeWindowsSheet
        serviceId={downtimeService?.id ?? null}
        serviceName={downtimeService?.name ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            setDowntimeService(null);
          }
        }}
        onChanged={catalog.reload}
      />
      <ServiceCategoriesAdminSheet
        open={isCategoriesOpen}
        categories={categoryState.categories}
        canWrite={writeFlags.canWriteCatalog}
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
