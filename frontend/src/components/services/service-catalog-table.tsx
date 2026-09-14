import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tableHeadClassName, tableRowClassName, tableWrapClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import {
  SERVICE_AVAILABILITY_META,
  SERVICE_LIFECYCLE_META,
} from "@/lib/theme/semantic-meta";

interface ServiceCatalogTableProperties {
  readonly rows: readonly ServiceCatalogRow[];
  readonly canManageForms: boolean;
  readonly pendingServiceId: string | null;
  readonly onPrepareForm: (serviceId: string) => void;
}

export function ServiceCatalogTable({
  rows,
  canManageForms,
  pendingServiceId,
  onPrepareForm,
}: ServiceCatalogTableProperties) {
  const { t } = useTranslation();

  if (rows.length === 0) {
    return (
      <EmptyState
        title={t("services.emptyTitle")}
        body={t("services.emptyBody")}
      />
    );
  }

  return (
    <div className={tableWrapClassName}>
      <table className="w-full min-w-[880px] text-left text-[13px]">
        <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
          <tr>
            <th className="px-3 py-2">{t("services.columnName")}</th>
            <th className="px-3 py-2">{t("services.columnLifecycle")}</th>
            <th className="px-3 py-2">{t("services.columnOffered")}</th>
            <th className="px-3 py-2">{t("services.columnForm")}</th>
            <th className="px-3 py-2">{t("services.columnAvailability")}</th>
            <th className="px-3 py-2 text-right">{t("services.columnActions")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ service, form }) => {
            const hasActiveForm = (form?.activeFormVersionRef ?? null) !== null;
            const isTicketReady = hasActiveForm && service.offeredToRequesters;
            return (
              <tr key={service.id} className={tableRowClassName}>
                <td className="px-3 py-2">
                  <span className="font-medium text-foreground">{service.name}</span>
                  <span className="ml-2 text-[11.5px] text-muted-foreground">
                    {service.slug}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={SERVICE_LIFECYCLE_META[service.lifecycle].tone}>
                    {t(`services.lifecycle.${service.lifecycle}`)}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {service.offeredToRequesters
                    ? t("services.offeredYes")
                    : t("services.offeredNo")}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={hasActiveForm ? "success" : "danger"}>
                    {hasActiveForm
                      ? t("services.formActive", {
                          count: form?.versions.length ?? 0,
                        })
                      : t("services.formMissing")}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={SERVICE_AVAILABILITY_META[service.availability].tone}>
                    {t(`services.availability.${service.availability}`)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  {isTicketReady ? (
                    <span className="text-[11.5px] text-muted-foreground">
                      {t("services.ticketReady")}
                    </span>
                  ) : canManageForms && !hasActiveForm ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pendingServiceId !== null}
                      onClick={() => onPrepareForm(service.id)}
                    >
                      {pendingServiceId === service.id
                        ? t("services.preparingForm")
                        : t("services.prepareForm")}
                    </Button>
                  ) : (
                    <span className="text-[11.5px] text-muted-foreground">
                      {t("services.notOfferedHint")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
