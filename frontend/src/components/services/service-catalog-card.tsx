import { ArrowRight, CalendarClock, FileJson2, Layers, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ServiceCatalogCardAdminFooter } from "@/components/services/service-catalog-card-admin-footer";
import { Badge, MetaBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import type { CatalogCoverageNote } from "@/lib/services/catalog-coverage-note";
import { shouldWarnServiceRuntimeAvailability } from "@/lib/services/filter-service-catalog-rows";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import {
  SERVICE_AVAILABILITY_META,
  SERVICE_LIFECYCLE_META,
} from "@/lib/theme/semantic-meta";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface ServiceCatalogCardProperties {
  readonly row: ServiceCatalogRow;
  readonly categoryName: string;
  readonly coverage: CatalogCoverageNote | null;
  readonly canManageForms: boolean;
  readonly canWriteCatalog: boolean;
  readonly canWriteAvailability: boolean;
  readonly pendingServiceId: string | null;
  readonly onPrepareForm: (serviceId: string) => void;
  readonly onEdit: (service: ServiceResponse) => void;
  readonly onStartOnboarding: (serviceId: string) => void;
  readonly onManageDowntime: (service: ServiceResponse) => void;
  readonly onCatalogChanged: () => Promise<void>;
}

export function ServiceCatalogCard({
  row,
  categoryName,
  coverage,
  canManageForms,
  canWriteCatalog,
  canWriteAvailability,
  pendingServiceId,
  onPrepareForm,
  onEdit,
  onStartOnboarding,
  onManageDowntime,
  onCatalogChanged,
}: ServiceCatalogCardProperties) {
  const { t, i18n } = useTranslation();
  const { service, form } = row;
  const activeVersion = form?.versions.find(
    (version) => version.formVersionRef === form.activeFormVersionRef,
  );
  const downtime = service.runtimeAvailability.activeDowntimeWindow;
  const hasUpcoming = service.runtimeAvailability.hasUpcomingDowntime === true;
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
              <p className="mt-0.5 text-[11px] text-muted-foreground">{categoryName}</p>
            </div>
          </div>
          <MetaBadge
            meta={{
              label: t(`services.lifecycle.${service.lifecycle}`),
              tone: SERVICE_LIFECYCLE_META[service.lifecycle].tone,
            }}
          />
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
        <MetaBadge
          meta={{
            label: t(`services.availability.${service.availability}`),
            tone: SERVICE_AVAILABILITY_META[service.availability].tone,
          }}
          className="text-[10px]"
        />
        <Badge
          tone={activeVersion ? "success" : "danger"}
          className="text-[10px] tnum"
          dot={false}
        >
          <FileJson2 size={10} />
          {activeVersion
            ? t("services.formVersionBadge", { version: activeVersion.version })
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
        {hasUpcoming ? (
          <button
            type="button"
            className="inline-flex"
            onClick={() => {
              if (canWriteAvailability) {
                onManageDowntime(service);
              }
            }}
          >
            <Badge tone="info" className="text-[10px]" dot={false}>
              {t("services.downtime.upcomingBadge", { count: 1 })}
            </Badge>
          </button>
        ) : null}
        <span className="ml-auto tnum text-[11px] text-muted-foreground">
          {t("services.openTicketCountBadge", { count: service.openTicketCount })}
        </span>
      </div>
      <div className="flex items-center justify-between border-t border-border/50 px-4 py-2.5">
        {coverage ? (
          <Badge tone={coverage.tone} dot={false} className="text-[10px]">
            {t(coverage.key)}
          </Badge>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="xs" asChild>
          <Link to="/tickets/new">
            {t("services.createTicket")} <ArrowRight size={11.5} />
          </Link>
        </Button>
      </div>
      <ServiceCatalogCardAdminFooter
        service={service}
        canManageForms={canManageForms}
        canWriteCatalog={canWriteCatalog}
        canWriteAvailability={canWriteAvailability}
        pendingServiceId={pendingServiceId}
        onPrepareForm={onPrepareForm}
        onEdit={onEdit}
        onStartOnboarding={onStartOnboarding}
        onManageDowntime={onManageDowntime}
        onCatalogChanged={onCatalogChanged}
      />
    </Card>
  );
}
