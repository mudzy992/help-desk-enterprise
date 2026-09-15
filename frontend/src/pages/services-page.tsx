import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ServiceCatalogGrid } from "@/components/services/service-catalog-grid";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { defaultServiceFormSchema } from "@/lib/services/default-service-form-schema";
import { useServiceCatalog } from "@/lib/services/use-service-catalog";
import {
  activateServiceFormVersion,
  createServiceForm,
  getServiceForm,
} from "@/services/service-catalog-api";

export function ServicesPage() {
  const { t } = useTranslation();
  const catalog = useServiceCatalog();
  const { hasPermission } = useSessionCapabilities();
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);
  const [actionErrorKey, setActionErrorKey] = useState<ApiErrorKey | null>(null);
  const [actionRequestId, setActionRequestId] = useState<string | null>(null);

  const prepareForm = async (serviceId: string) => {
    setPendingServiceId(serviceId);
    setActionErrorKey(null);
    setActionRequestId(null);
    try {
      const existing = await getServiceForm(serviceId).catch(() => null);
      const draft = existing?.versions.find(
        (version) => version.status === "DRAFT",
      );
      const formVersionRef =
        draft?.formVersionRef ??
        (await createServiceForm(serviceId, defaultServiceFormSchema))
          .formVersionRef;
      await activateServiceFormVersion(serviceId, formVersionRef);
      await catalog.reload();
    } catch (error) {
      setActionErrorKey(mapApiError(error));
      setActionRequestId(readApiRequestId(error));
    } finally {
      setPendingServiceId(null);
    }
  };

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("services.title")]}
        title={t("services.title")}
        subtitle={t("services.intro")}
      />
      {actionErrorKey ? (
        <div className="mb-3">
          <ApiErrorText
            messageKey={actionErrorKey}
            requestId={actionRequestId}
          />
        </div>
      ) : null}
      {catalog.isLoading ? (
        <PanelSkeleton className="mt-0" label={t("services.catalogHeading")} />
      ) : catalog.errorKey ? (
        <ApiErrorText
          messageKey={catalog.errorKey}
          requestId={catalog.requestId}
        />
      ) : (
        <ServiceCatalogGrid
          rows={catalog.rows}
          canManageForms={hasPermission(permissionKeys.serviceFormsWrite)}
          pendingServiceId={pendingServiceId}
          onPrepareForm={(serviceId) => void prepareForm(serviceId)}
        />
      )}
    </section>
  );
}
