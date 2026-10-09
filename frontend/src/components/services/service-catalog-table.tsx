import {
  ArrowRight,
  Blocks,
  CalendarClock,
  FileJson2,
  Layers,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge, MetaBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { tableHeadClassName, tableRowClassName } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import type { CatalogCoverageNote } from "@/lib/services/catalog-coverage-note";
import { shouldWarnServiceRuntimeAvailability } from "@/lib/services/filter-service-catalog-rows";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import {
  completedOnboardingCount,
} from "@/lib/services/onboarding-step-state";
import {
  SERVICE_AVAILABILITY_META,
  SERVICE_LIFECYCLE_META,
} from "@/lib/theme/semantic-meta";
import {
  SERVICE_ONBOARDING_STEPS,
  type ServiceOnboardingResponse,
} from "@/services/service-onboarding-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface ServiceCatalogTableProperties {
  readonly rows: readonly ServiceCatalogRow[];
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly coverageByServiceId: ReadonlyMap<string, CatalogCoverageNote>;
  readonly onboardingByServiceId: ReadonlyMap<string, ServiceOnboardingResponse>;
  readonly canManageForms: boolean;
  readonly canWriteCatalog: boolean;
  readonly canWriteAvailability: boolean;
  readonly onPrepareForm: (serviceId: string) => void;
  readonly onEdit: (service: ServiceResponse) => void;
  readonly onStartOnboarding: (serviceId: string) => void;
  readonly onManageDowntime: (service: ServiceResponse) => void;
  readonly onManageLifecycle: (service: ServiceResponse) => void;
}

export function ServiceCatalogTable({
  rows,
  categoryNames,
  coverageByServiceId,
  onboardingByServiceId,
  canManageForms,
  canWriteCatalog,
  canWriteAvailability,
  onPrepareForm,
  onEdit,
  onStartOnboarding,
  onManageDowntime,
  onManageLifecycle,
}: ServiceCatalogTableProperties) {
  const { t } = useTranslation();

  return (
    <ScrollRegion
      label={t("services.catalogHeading")}
      className="fade-in overflow-x-auto rounded-xl border border-border bg-surface shadow-card"
    >
      <table className="w-full min-w-[1180px] text-left text-[12px]">
        <caption className="sr-only">{t("services.catalogTableCaption")}</caption>
        <thead className="bg-elevated/45">
          <tr className={`border-b border-border/70 ${tableHeadClassName}`}>
            <th scope="col" className="px-4 py-2.5">{t("services.columnName")}</th>
            <th scope="col" className="px-3 py-2.5">{t("services.columnLifecycle")}</th>
            <th scope="col" className="px-3 py-2.5">{t("services.columnAvailability")}</th>
            <th scope="col" className="px-3 py-2.5">{t("services.columnForm")}</th>
            <th scope="col" className="px-3 py-2.5">{t("services.columnClassification")}</th>
            <th scope="col" className="px-3 py-2.5">{t("services.columnCoverage")}</th>
            <th scope="col" className="px-3 py-2.5 text-right">{t("services.columnTickets")}</th>
            <th scope="col" className="px-4 py-2.5 text-right">{t("services.columnActions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row) => {
            const service = row.service;
            return (
              <ServiceCatalogTableRow
                key={service.id}
                row={row}
                categoryName={categoryNames.get(service.categoryId) ?? service.category?.name ?? service.slug}
                coverage={coverageByServiceId.get(service.id) ?? null}
                onboarding={onboardingByServiceId.get(service.id) ?? null}
                canManageForms={canManageForms}
                canWriteCatalog={canWriteCatalog}
                canWriteAvailability={canWriteAvailability}
                onPrepareForm={onPrepareForm}
                onEdit={onEdit}
                onStartOnboarding={onStartOnboarding}
                onManageDowntime={onManageDowntime}
                onManageLifecycle={onManageLifecycle}
              />
            );
          })}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

interface ServiceCatalogTableRowProperties {
  readonly row: ServiceCatalogRow;
  readonly categoryName: string;
  readonly coverage: CatalogCoverageNote | null;
  readonly onboarding: ServiceOnboardingResponse | null;
  readonly canManageForms: boolean;
  readonly canWriteCatalog: boolean;
  readonly canWriteAvailability: boolean;
  readonly onPrepareForm: (serviceId: string) => void;
  readonly onEdit: (service: ServiceResponse) => void;
  readonly onStartOnboarding: (serviceId: string) => void;
  readonly onManageDowntime: (service: ServiceResponse) => void;
  readonly onManageLifecycle: (service: ServiceResponse) => void;
}

function ServiceCatalogTableRow({
  row,
  categoryName,
  coverage,
  onboarding,
  canManageForms,
  canWriteCatalog,
  canWriteAvailability,
  onPrepareForm,
  onEdit,
  onStartOnboarding,
  onManageDowntime,
  onManageLifecycle,
}: ServiceCatalogTableRowProperties) {
  const { t, i18n } = useTranslation();
  const { service } = row;
  const downtime = service.runtimeAvailability.activeDowntimeWindow;
  const hasUpcomingDowntime = service.runtimeAvailability.hasUpcomingDowntime;
  const showRuntimeWarning = shouldWarnServiceRuntimeAvailability(
    service.runtimeAvailability.isCurrentlyUnavailable,
    service.runtimeAvailability.hasActiveDowntime,
  );
  const actionsAvailable = canWriteCatalog || canWriteAvailability;
  const onboardingComplete = onboarding === null
    ? 0
    : completedOnboardingCount(onboarding.completedSteps);
  const onboardingLabel = onboarding === null
    ? null
    : onboarding.status === "ABANDONED"
      ? t("services.onboarding.progressPaused", {
          completed: onboardingComplete,
          total: SERVICE_ONBOARDING_STEPS.length,
        })
      : onboarding.status === "READY_FOR_FINALIZATION"
        ? t("services.onboarding.progressReady", {
            completed: onboardingComplete,
            total: SERVICE_ONBOARDING_STEPS.length,
          })
        : t("services.onboarding.progress", {
            completed: onboardingComplete,
            total: SERVICE_ONBOARDING_STEPS.length,
          });
  const onboardingTone = onboarding?.status === "ABANDONED"
    ? "warning"
    : onboarding?.status === "READY_FOR_FINALIZATION"
      ? "success"
      : "info";

  return (
    <tr data-testid={`service-row-${service.id}`} className={tableRowClassName}>
      <td className="px-4 align-middle">
        <div className="flex min-w-[245px] items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-muted-foreground">
            <Layers size={15} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] font-semibold leading-5 text-foreground">
                {service.name}
              </span>
              {onboarding !== null ? (
                <Badge
                  data-testid={`service-onboarding-progress-${service.id}`}
                  tone={onboardingTone}
                  className="text-[10px]"
                  dot
                >
                  {onboardingLabel}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              {categoryName}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 align-middle">
        <MetaBadge
          meta={{
            label: t(`services.lifecycle.${service.lifecycle}`),
            tone: SERVICE_LIFECYCLE_META[service.lifecycle].tone,
          }}
        />
      </td>
      <td className="px-3 align-middle">
        <div className="flex min-w-[225px] flex-col items-start gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <MetaBadge
              meta={{
                label: t(`services.availability.${service.availability}`),
                tone: SERVICE_AVAILABILITY_META[service.availability].tone,
              }}
              className="text-[10px]"
            />
            {showRuntimeWarning ? (
              <Badge tone="warning" className="max-w-[230px] whitespace-normal text-[10px] leading-4" dot={false}>
                {t("services.runtimeUnavailableWarning")}
              </Badge>
            ) : null}
          </div>
          {downtime !== null ? (
            <p className="flex max-w-[245px] items-start gap-1.5 text-[10.5px] leading-4 text-foreground/85">
              <CalendarClock size={12} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
              <span>
                <span className="font-medium">{t("services.plannedDowntime")}:</span>{" "}
                {downtime.message}{" "}
                <span className="text-muted-foreground">
                  {t("services.downtimeUntil")}{" "}
                  <RelativeTime value={downtime.endsAt} locale={i18n.language} />
                </span>
              </span>
            </p>
          ) : null}
          {hasUpcomingDowntime ? (
            canWriteAvailability ? (
              <button
                type="button"
                className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
                aria-label={t("services.downtime.manageUpcoming", { name: service.name })}
                onClick={() => onManageDowntime(service)}
              >
                <Badge tone="info" className="text-[10px]" dot={false}>
                  {t("services.downtime.upcomingBadge", { count: 1 })}
                </Badge>
              </button>
            ) : (
              <Badge tone="info" className="text-[10px]" dot={false}>
                {t("services.downtime.upcomingBadge", { count: 1 })}
              </Badge>
            )
          ) : null}
        </div>
      </td>
      <td className="px-3 align-middle">
        <Badge
          tone={service.activeForm.activeFormVersionRef ? "success" : "danger"}
          className="tnum text-[10px]"
          dot={false}
        >
          <FileJson2 size={11} aria-hidden="true" />
          {service.activeForm.activeFormVersionRef
            ? t("services.formSummaryBadge", {
                version: String(service.activeForm.version ?? "—"),
                count: service.activeForm.fieldCount,
              })
            : t("services.formMissing")}
        </Badge>
      </td>
      <td className="px-3 align-middle">
        <div className="flex min-w-[150px] flex-col items-start gap-1.5">
          <Badge tone="neutral" className="text-[10px]" dot={false}>
            {t(`services.classificationOptions.${service.classification}`)}
          </Badge>
          {service.requiresApproval ? (
            <Badge tone="warning" className="text-[10px]" dot={false}>
              <ShieldCheck size={11} aria-hidden="true" />
              {t("services.requiresApproval")}
            </Badge>
          ) : null}
        </div>
      </td>
      <td className="px-3 align-middle">
        {coverage ? (
          <Badge tone={coverage.tone} dot={false} className="max-w-[210px] whitespace-normal text-[10px] leading-4">
            {t(coverage.key)}
          </Badge>
        ) : (
          <span className="text-muted-foreground" aria-label={t("services.coverageUnavailable")}>—</span>
        )}
      </td>
      <td className="px-3 text-right align-middle">
        <span className="tnum whitespace-nowrap text-[11.5px] text-muted-foreground">
          {t("services.openTicketCountBadge", { count: service.openTicketCount })}
        </span>
      </td>
      <td className="px-4 text-right align-middle">
        <div className="flex min-w-[205px] items-center justify-end gap-1.5">
          <Button variant="ghost" size="xs" asChild>
            <Link to="/tickets/new" data-testid={`service-create-ticket-${service.id}`}>
              {t("services.createTicket")} <ArrowRight size={11.5} aria-hidden="true" />
            </Link>
          </Button>
          {actionsAvailable ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("services.actionsForService", { name: service.name })}
                  data-testid={`service-actions-${service.id}`}
                >
                  <MoreHorizontal size={15} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[14rem]">
                <DropdownMenuLabel>{t("services.columnActions")}</DropdownMenuLabel>
                {canWriteCatalog ? (
                  <DropdownMenuItem onSelect={() => onEdit(service)}>
                    <Pencil size={14} aria-hidden="true" />
                    {t("services.editService")}
                  </DropdownMenuItem>
                ) : null}
                {canWriteAvailability ? (
                  <DropdownMenuItem onSelect={() => onManageDowntime(service)}>
                    <CalendarClock size={14} aria-hidden="true" />
                    {t("services.downtime.schedule")}
                  </DropdownMenuItem>
                ) : null}
                {canWriteCatalog && service.lifecycle === "DRAFT" ? (
                  <DropdownMenuItem onSelect={() => onStartOnboarding(service.id)}>
                    <Blocks size={14} aria-hidden="true" />
                    {onboarding === null
                      ? t("services.startOnboarding")
                      : t(onboarding.status === "ABANDONED"
                        ? "services.onboarding.resume"
                        : "services.onboarding.continue")}
                  </DropdownMenuItem>
                ) : null}
                {canWriteCatalog && canManageForms ? (
                  <DropdownMenuItem onSelect={() => onPrepareForm(service.id)}>
                    <FileJson2 size={14} aria-hidden="true" />
                    {t("services.manageForm")}
                  </DropdownMenuItem>
                ) : null}
                {canWriteCatalog ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onManageLifecycle(service)}>
                      <ArrowRight size={14} aria-hidden="true" />
                      {t("services.manageLifecycle")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
