import { Blocks, Plus } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminConfigChangedBanner } from "@/components/admin/admin-config-changed-banner";
import { ServiceCatalogLifecycleDialog } from "@/components/services/service-catalog-lifecycle-dialog";
import { ServiceCatalogMutationSheet } from "@/components/services/service-catalog-mutation-sheet";
import { ServiceCatalogReadOnlyBanner } from "@/components/services/service-catalog-read-only-banner";
import { ServiceDowntimeWindowsSheet } from "@/components/services/service-downtime-windows-sheet";
import { ServiceFormBuilderSheet } from "@/components/services/form-builder/service-form-builder-sheet";
import { ServiceOnboardingPipelineCard } from "@/components/services/onboarding/service-onboarding-pipeline-card";
import { ServiceOnboardingWizard } from "@/components/services/onboarding/service-onboarding-wizard";
import { ServiceCategoriesAdminSheet } from "@/components/services/categories/service-categories-admin-sheet";
import { ServiceCategoryMutationSheet } from "@/components/services/categories/service-category-mutation-sheet";
import { ServiceCatalogList } from "@/components/services/service-catalog-list";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { PageHeader, brandCrumb } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { serviceCatalogLoadState } from "@/lib/services/service-catalog-load-state";
import { useCatalogRoutingCoverage } from "@/lib/services/use-catalog-routing-coverage";
import { useServiceCatalog } from "@/lib/services/use-service-catalog";
import { useServiceCategories } from "@/lib/services/use-service-categories";
import { useVisibleOnboardings } from "@/lib/services/use-visible-onboardings";
import { canBypassAdminReadOnly, resolveCatalogWriteFlags } from "@/lib/services/resolve-catalog-write-flags";
import {
  adminReadOnlyModuleKeys,
  useAdminModuleReadOnly,
} from "@/lib/settings/use-admin-module-read-only";
import { useAdminConfigLiveRefresh } from "@/lib/realtime/use-admin-config-live-refresh";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

export function ServicesPage() {
  const { t } = useTranslation();
  const catalog = useServiceCatalog();
  const categoryState = useServiceCategories();
  const routingCoverage = useCatalogRoutingCoverage();
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
  const [lifecycleService, setLifecycleService] = useState<ServiceResponse | null>(null);
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
  const reloadCatalog = useCallback(async () => {
    await Promise.all([catalog.reload(), routingCoverage.reload()]);
  }, [catalog.reload, routingCoverage.reload]);
  const reloadCategories = useCallback(async () => {
    await Promise.all([categoryState.reload(), reloadCatalog()]);
  }, [categoryState.reload, reloadCatalog]);
  const containerRef = useRef<HTMLElement>(null);
  const live = useAdminConfigLiveRefresh({
    domains: ["catalog", "routing"],
    reload: reloadCategories,
    containerRef,
  });
  const catalogView = serviceCatalogLoadState({
    services: {
      hasLoaded: catalog.hasLoaded,
      isLoading: catalog.isLoading,
      hasError: catalog.errorKey !== null,
    },
    categories: {
      hasLoaded: categoryState.hasLoaded,
      isLoading: categoryState.isLoading,
    },
  });
  const hasRefreshError =
    (catalog.hasLoaded && catalog.errorKey !== null) ||
    (categoryState.hasLoaded && categoryState.errorKey !== null);

  return (
    <section ref={containerRef}>
      <AdminConfigChangedBanner
        pending={live.pending}
        onRefresh={live.refreshNow}
        onDismiss={live.dismiss}
      />
      <PageHeader
        crumbs={[brandCrumb, t("navigation.sections.services"), t("services.title")]}
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
                <Blocks size={14} aria-hidden="true" />
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
                <Plus size={14} aria-hidden="true" />
                {t("services.createService")}
              </Button>
            </>
          ) : null
        }
      />
      <ServiceCatalogReadOnlyBanner visible={catalogReadOnly.isLocked} />
      {catalogView === "loading" ? (
        <PanelSkeleton className="mt-0" label={t("services.catalogHeading")} />
      ) : catalogView === "error" ? (
        <div className="grid gap-3 rounded-xl border border-danger/25 bg-danger/5 p-4 sm:p-5">
          <ApiErrorText messageKey={catalog.errorKey ?? "errors.network"} requestId={catalog.requestId} />
          <div>
            <Button type="button" size="sm" variant="outline" onClick={() => void reloadCategories()}>
              {t("services.retryLoad")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {hasRefreshError ? (
            <div className="mb-3 grid gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-3.5">
              <div className="grid gap-1.5">
                {catalog.hasLoaded && catalog.errorKey ? (
                  <>
                    <p className="text-[11.5px] text-muted-foreground">
                      {t("services.catalogRefreshWarning")}
                    </p>
                    <ApiErrorText messageKey={catalog.errorKey} requestId={catalog.requestId} />
                  </>
                ) : null}
                {categoryState.hasLoaded && categoryState.errorKey ? (
                  <>
                    <p className="text-[11.5px] text-muted-foreground">
                      {t("services.categoriesRefreshWarning")}
                    </p>
                    <ApiErrorText
                      messageKey={categoryState.errorKey}
                      requestId={categoryState.requestId}
                    />
                  </>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void reloadCategories()}
              >
                {t("services.retryLoad")}
              </Button>
            </div>
          ) : null}
          <ServiceCatalogList
            rows={catalog.rows}
            categories={categoryState.categories}
            onboardings={onboardings}
            coverageByServiceId={routingCoverage.notesByServiceId}
            routingCoverage={routingCoverage}
            canManageForms={writeFlags.canManageForms}
            canWriteCatalog={writeFlags.canWriteCatalog}
            canWriteAvailability={writeFlags.canWriteAvailability}
            onPrepareForm={setFormServiceId}
            onCreate={() => {
              setEditingService(null);
              setIsCreateOpen(true);
            }}
            onEdit={setEditingService}
            onStartOnboarding={setWizardServiceId}
            onManageCategories={() => setIsCategoriesOpen(true)}
            onManageDowntime={setDowntimeService}
            onManageLifecycle={setLifecycleService}
          />
          {wizardServiceId !== undefined ? (
            <ServiceOnboardingWizard
              serviceId={wizardServiceId}
              categories={categoryState.categories}
              canWriteForms={writeFlags.canManageForms}
              onClose={() => setWizardServiceId(undefined)}
              onFinished={reloadCatalog}
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
      <ServiceCatalogLifecycleDialog
        service={lifecycleService}
        onClose={() => setLifecycleService(null)}
        onChanged={reloadCatalog}
      />
      <ServiceFormBuilderSheet
        serviceId={formServiceId}
        canWrite={writeFlags.canManageForms}
        onOpenChange={(open) => {
          if (!open) {
            setFormServiceId(null);
          }
        }}
        onChanged={reloadCatalog}
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
        onSaved={reloadCatalog}
      />
      <ServiceDowntimeWindowsSheet
        serviceId={downtimeService?.id ?? null}
        serviceName={downtimeService?.name ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            setDowntimeService(null);
          }
        }}
        onChanged={reloadCatalog}
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
