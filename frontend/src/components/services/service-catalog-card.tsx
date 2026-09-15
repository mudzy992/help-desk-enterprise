import { CalendarClock, FileJson2, Layers, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import { shouldWarnServiceRuntimeAvailability } from "@/lib/services/filter-service-catalog-rows";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import {
  SERVICE_AVAILABILITY_META,
  SERVICE_LIFECYCLE_META,
} from "@/lib/theme/semantic-meta";

interface ServiceCatalogCardProperties {
  readonly row: ServiceCatalogRow;
  readonly canManageForms: boolean;
  readonly pendingServiceId: string | null;
  readonly onPrepareForm: (serviceId: string) => void;
}

export function ServiceCatalogCard({
  row,
  canManageForms,
  pendingServiceId,
  onPrepareForm,
}: ServiceCatalogCardProperties) {
  const { t, i18n } = useTranslation();
  const { service, form } = row;
  const hasActiveForm = (form?.activeFormVersionRef ?? null) !== null;
  const isTicketReady = hasActiveForm && service.offeredToRequesters;
  const downtime = service.runtimeAvailability.activeDowntimeWindow;
  const showRuntimeWarning = shouldWarnServiceRuntimeAvailability(
    service.runtimeAvailability.isCurrentlyUnavailable,
    service.runtimeAvailability.hasActiveDowntime,
  );

  return (
    <Card className="group flex flex-col transition-all hover:border-[#31405C] hover:bg-elevated/30">
      <div className="flex-1 px-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-md border border-border bg-elevated text-muted-foreground transition-colors group-hover:text-[#7FA8F5]">
              <Layers size={16} strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-[13.5px] font-semibold leading-[18px] text-foreground">
                {service.name}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{service.slug}</p>
            </div>
          </div>
          <Badge tone={SERVICE_LIFECYCLE_META[service.lifecycle].tone} dot>
            {t(`services.lifecycle.${service.lifecycle}`)}
          </Badge>
        </div>
        {downtime ? (
          <div className="mt-2.5 flex items-start gap-2 rounded-md border border-info/25 bg-info/10 px-2.5 py-2">
            <CalendarClock size={13} className="mt-0.5 shrink-0 text-info" />
            <p className="text-[11px] leading-4 text-foreground/85">
              <span className="font-medium">{t("services.plannedDowntime")}:</span>{" "}
              {downtime.message}{" "}
              <span className="text-muted-foreground">
                {t("services.downtimeUntil")}{" "}
                <RelativeTime value={downtime.endsAt} locale={i18n.language} />
              </span>
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-3">
        <Badge
          tone={SERVICE_AVAILABILITY_META[service.availability].tone}
          className="text-[10px]"
          dot
        >
          {t(`services.availability.${service.availability}`)}
        </Badge>
        <Badge
          tone={hasActiveForm ? "success" : "danger"}
          className="text-[10px]"
          dot={false}
        >
          <FileJson2 size={10} />
          {hasActiveForm
            ? t("services.formActive", { count: form?.versions.length ?? 0 })
            : t("services.formMissing")}
        </Badge>
        {service.requiresApproval ? (
          <Badge tone="warning" className="text-[10px]" dot={false}>
            <ShieldCheck size={10} />
            {t("services.requiresApproval")}
          </Badge>
        ) : null}
        {showRuntimeWarning ? (
          <Badge tone="warning" className="text-[10px]" dot={false}>
            {t("services.runtimeUnavailableWarning")}
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center justify-end border-t border-border/50 px-4 py-2.5">
        <ServiceCatalogCardAction
          serviceId={service.id}
          isTicketReady={isTicketReady}
          hasActiveForm={hasActiveForm}
          canManageForms={canManageForms}
          pendingServiceId={pendingServiceId}
          onPrepareForm={onPrepareForm}
        />
      </div>
    </Card>
  );
}

interface ServiceCatalogCardActionProperties {
  readonly serviceId: string;
  readonly isTicketReady: boolean;
  readonly hasActiveForm: boolean;
  readonly canManageForms: boolean;
  readonly pendingServiceId: string | null;
  readonly onPrepareForm: (serviceId: string) => void;
}

function ServiceCatalogCardAction({
  serviceId,
  isTicketReady,
  hasActiveForm,
  canManageForms,
  pendingServiceId,
  onPrepareForm,
}: ServiceCatalogCardActionProperties) {
  const { t } = useTranslation();
  if (isTicketReady) {
    return (
      <span className="text-[11.5px] text-muted-foreground">
        {t("services.ticketReady")}
      </span>
    );
  }
  if (canManageForms && !hasActiveForm) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pendingServiceId !== null}
        onClick={() => onPrepareForm(serviceId)}
      >
        {pendingServiceId === serviceId
          ? t("services.preparingForm")
          : t("services.prepareForm")}
      </Button>
    );
  }
  return (
    <span className="text-[11.5px] text-muted-foreground">
      {t("services.notOfferedHint")}
    </span>
  );
}
