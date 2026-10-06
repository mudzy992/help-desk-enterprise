import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RoutingCoverageTable } from "@/components/routing/routing-coverage-table";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { labelClassName, selectCompactClassName } from "@/components/ui/control";
import { readApiRequestId } from "@/lib/map-api-error";
import { mapRoutingError, type RoutingErrorKey } from "@/lib/routing/map-routing-error";
import { useRoutingCatalog } from "@/lib/routing/use-routing-catalog";
import {
  listRoutingCoverage,
  type RoutingCoveragePage,
} from "@/services/routing-api";

interface RoutingCoveragePanelProperties {
  readonly onCreateRule: () => void;
}

const defaultPageSize = 50;

export function RoutingCoveragePanel({ onCreateRule }: RoutingCoveragePanelProperties) {
  const { t } = useTranslation();
  const catalog = useRoutingCatalog();
  const [page, setPage] = useState<RoutingCoveragePage | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [originUnitId, setOriginUnitId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const take = defaultPageSize;
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<readonly (string | undefined)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [coverageError, setCoverageError] = useState<RoutingErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const groupNameById = useMemo(
    () => new Map(catalog.groups.map((group) => [group.id, group.name])),
    [catalog.groups],
  );

  const loadCoverage = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setCoverageError(null);
    setRequestId(null);
    try {
      const result = await listRoutingCoverage({
        originUnitId: originUnitId || undefined,
        serviceId: serviceId || undefined,
        includeInactive,
        take,
        cursor,
      });
      if (sequence === requestSequence.current) {
        setPage(result);
      }
    } catch (error) {
      if (sequence === requestSequence.current) {
        setPage(null);
        setCoverageError(mapRoutingError(error));
        setRequestId(readApiRequestId(error));
      }
    } finally {
      if (sequence === requestSequence.current) {
        setIsLoading(false);
      }
    }
  }, [cursor, includeInactive, originUnitId, serviceId, take]);

  useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  const resetPagination = () => {
    setCursor(undefined);
    setCursorHistory([]);
  };
  const onPreviousPage = () => {
    if (cursorHistory.length === 0) return;
    const previousCursor = cursorHistory[cursorHistory.length - 1];
    setCursorHistory(cursorHistory.slice(0, -1));
    setCursor(previousCursor);
  };
  const onNextPage = () => {
    if (page?.nextCursor === null || page === null) return;
    setCursorHistory([...cursorHistory, cursor]);
    setCursor(page.nextCursor);
  };

  const hasFilters = originUnitId.length > 0 || serviceId.length > 0 || includeInactive;
  const errorKey = coverageError ?? catalog.errorKey;
  const errorRequestId = coverageError === null ? catalog.requestId : requestId;

  return (
    <Card>
      <CardHeader title={t("routing.coverageHeading")} />
      <div className="fade-in space-y-3 px-4 py-3.5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(170px,1fr)_minmax(170px,1fr)_auto] md:items-end">
          <label className={labelClassName}>
            {t("routing.coverageOriginFilter")}
            <select
              className={selectCompactClassName}
              value={originUnitId}
              onChange={(event) => {
                setOriginUnitId(event.target.value);
                resetPagination();
              }}
              disabled={catalog.isLoading}
            >
              <option value="">{t("routing.coverageAllOrigins")}</option>
              {catalog.originUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.label}</option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            {t("routing.coverageServiceFilter")}
            <select
              className={selectCompactClassName}
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                resetPagination();
              }}
              disabled={catalog.isLoading}
            >
              <option value="">{t("routing.coverageAllServices")}</option>
              {catalog.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {t(`services.lifecycle.${service.lifecycle}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-8 items-center gap-2 pb-1 text-[12px] text-foreground">
            <Switch
              checked={includeInactive}
              onCheckedChange={(checked) => {
                setIncludeInactive(checked);
                resetPagination();
              }}
              aria-label={t("routing.coverageIncludeInactive")}
            />
            {t("routing.coverageIncludeInactive")}
          </label>
        </div>

        {isLoading || catalog.isLoading ? (
          <PanelSkeleton className="mt-0" label={t("routing.coverageHeading")} />
        ) : errorKey ? (
          <ApiErrorText messageKey={errorKey} requestId={errorRequestId} />
        ) : (
          <>
            <RoutingCoverageTable
              items={page?.items ?? []}
              groupNameById={groupNameById}
              emptyAction={
                hasFilters ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOriginUnitId("");
                      setServiceId("");
                      setIncludeInactive(false);
                      resetPagination();
                    }}
                  >
                    {t("routing.coverageClearFilters")}
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={onCreateRule}>
                    {t("routing.newRule")}
                  </Button>
                )
              }
            />
            {page !== null && page.total > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-[11.5px] text-muted-foreground">
                <span>
                  {t("routing.coveragePagination", {
                    page: cursorHistory.length + 1,
                    pages: Math.max(1, Math.ceil(page.total / page.take)),
                    total: page.total,
                  })}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isLoading || cursorHistory.length === 0}
                    onClick={onPreviousPage}
                  >
                    {t("tickets.previous")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isLoading || page.nextCursor === null}
                    onClick={onNextPage}
                  >
                    {t("tickets.next")}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
