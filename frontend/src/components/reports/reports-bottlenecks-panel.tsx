import { AlertTriangle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HBars } from "@/components/charts/h-bars";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  bottleneckBreakdownBars,
  bottleneckCounterColor,
  bottleneckCounterKeys,
  bottleneckCounterLabelKeys,
  bottleneckTotal,
  bottleneckTrendRows,
} from "@/lib/reports/bottleneck-view";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { readReportErrorCode } from "@/lib/reports/report-trends-view";
import { ticketText } from "@/lib/tickets/ticket-text";
import {
  fetchBottlenecks,
  type BottlenecksResponse,
} from "@/services/reports-api";

/** Poruka se poklapa sa `reports.errors.*` mapom (vidi `ReportTrendsPanel`). */
const disabledMessageKey = "reports.errors.BOTTLENECKS_DISABLED" as const;

/**
 * Val 1 (M15/B2): `GET /reports/bottlenecks` je postojao, ali ga nijedan ekran
 * nije zvao — RAW-ova svrha izvještaja („identifikacija uskih grla“) nije bila
 * dovršena. Panel prikazuje četiri brojača, tri razreza i dnevni trend, uz isti
 * OU opseg i isti period kao ostatak pregleda.
 */
export function ReportsBottlenecksPanel({
  organizationalUnitId,
  from,
  to,
}: {
  readonly organizationalUnitId: string | null;
  readonly from: string;
  readonly to: string;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<BottlenecksResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  /** Isključena postavka nije greška — prikazuje se kao stanje, bez „pokušaj ponovo“. */
  const [disabledKey, setDisabledKey] = useState<typeof disabledMessageKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setDisabledKey(null);
    setRequestId(null);
    try {
      setData(
        await fetchBottlenecks({
          organizationalUnitId: organizationalUnitId ?? "",
          from,
          to,
        }),
      );
    } catch (error) {
      setData(null);
      if (readReportErrorCode(error) === "BOTTLENECKS_DISABLED") {
        setDisabledKey(disabledMessageKey);
      } else {
        setErrorKey(mapApiError(error));
      }
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [from, organizationalUnitId, to]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading && data === null) {
    return <PanelSkeleton className="mt-0" label={t("reports.bottlenecks.title")} />;
  }
  if (disabledKey !== null) {
    return (
      <EmptyState
        icon={<AlertTriangle size={18} strokeWidth={1.8} />}
        title={t("reports.bottlenecks.disabledTitle")}
        body={t(disabledKey)}
      />
    );
  }
  if (errorKey !== null) {
    return (
      <div className="mt-2">
        <ApiErrorText messageKey={errorKey} requestId={requestId} />
        <Button className="mt-3" onClick={() => void load()} size="sm" variant="secondary">
          <RefreshCw size={14} strokeWidth={1.8} />
          {t("reports.bottlenecks.retry")}
        </Button>
      </div>
    );
  }
  if (data === null || bottleneckTotal(data.counts) === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle size={18} strokeWidth={1.8} />}
        title={t("reports.bottlenecks.emptyTitle")}
        body={t("reports.bottlenecks.emptyBody")}
      />
    );
  }

  const breakdowns = [
    { key: "unit", title: t("reports.bottlenecks.byUnit"), rows: data.byOrganizationalUnit },
    { key: "service", title: t("reports.bottlenecks.byService"), rows: data.byService },
    { key: "priority", title: t("reports.bottlenecks.byPriority"), rows: data.byPriority },
  ] as const;
  const trend = bottleneckTrendRows(data.trend);

  return (
    <div className="mt-2 space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {bottleneckCounterKeys.map((key) => (
          <StatCard
            key={key}
            emphasis={key === "overdue"}
            label={t(bottleneckCounterLabelKeys[key])}
            value={data.counts[key]}
            hint={key === "overdue" ? t("reports.bottlenecks.overdueHint") : undefined}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {breakdowns.map((breakdown) => {
          // Prioritet se prevodi na jezik interfejsa; OU i servis stižu kao nazivi.
          const bars = bottleneckBreakdownBars(breakdown.rows, (key) =>
            ticketText(t, key),
          );
          return (
            <Card key={breakdown.key} className="fade-in">
              <CardHeader
                title={breakdown.title}
                subtitle={t("reports.bottlenecks.breakdownSubtitle")}
              />
              <div className="px-4 py-4">
                {bars.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    {t("reports.bottlenecks.breakdownEmpty")}
                  </p>
                ) : (
                  <HBars items={[...bars]} />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="fade-in">
        <CardHeader
          title={t("reports.bottlenecks.trendTitle")}
          subtitle={t("reports.bottlenecks.trendSubtitle")}
          actions={<Badge tone="neutral">{data.window.from.slice(0, 10)} – {data.window.to.slice(0, 10)}</Badge>}
        />
        <div className="overflow-x-auto px-4 py-4">
          {trend.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              {t("reports.bottlenecks.trendEmpty")}
            </p>
          ) : (
            <table className="w-full min-w-[560px] text-left text-[12.5px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.07em] text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("reports.bottlenecks.trendDate")}</th>
                  <th className="py-2 pr-3 font-medium">{t("reports.bottlenecks.trendCreated")}</th>
                  {bottleneckCounterKeys.map((key) => (
                    <th key={key} className="py-2 pr-3 font-medium">
                      {t(bottleneckCounterLabelKeys[key])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trend.map((entry) => (
                  <tr key={entry.date} className="border-t border-border/70">
                    <td className="py-2 pr-3 tnum text-muted-foreground">{entry.date}</td>
                    <td className="py-2 pr-3 tnum text-foreground">{entry.createdCount}</td>
                    {bottleneckCounterKeys.map((key) => (
                      <td
                        key={key}
                        className="py-2 pr-3 tnum"
                        style={entry[key] > 0 ? { color: bottleneckCounterColor[key] } : undefined}
                      >
                        {entry[key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
