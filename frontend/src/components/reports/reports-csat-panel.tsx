import { MessageSquareHeart, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HBars } from "@/components/charts/h-bars";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { csatBucketBars, csatBucketRows } from "@/lib/reports/csat-view";
import { formatCsat } from "@/lib/reports/report-format";
import {
  fetchTicketCsatSummary,
  type TicketCsatSummary,
} from "@/services/tickets-csat-api";

/**
 * Val 1 (M9/B3): RAW traži CSAT razrez po OU/servisu/grupi, a `GET
 * /tickets/csat/summary` ga je već računao bez ijednog pozivaoca. Skala i prag
 * dolaze iz CSAT konfiguracije (`private.csat.scaleMax`), pa se prikazuje
 * „x / 10“ kad je skala 10, a ne „x / 5“.
 */
export function ReportsCsatPanel() {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState<TicketCsatSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      setSummary(await fetchTicketCsatSummary());
    } catch (error) {
      setSummary(null);
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading && summary === null) {
    return <PanelSkeleton className="mt-0" label={t("reports.csat.title")} />;
  }
  if (errorKey !== null) {
    return (
      <div className="mt-2">
        <ApiErrorText messageKey={errorKey} requestId={requestId} />
        <Button className="mt-3" onClick={() => void load()} size="sm" variant="secondary">
          <RefreshCw size={14} strokeWidth={1.8} />
          {t("reports.csat.retry")}
        </Button>
      </div>
    );
  }
  if (summary === null || summary.count === 0) {
    return (
      <EmptyState
        icon={<MessageSquareHeart size={18} strokeWidth={1.8} />}
        title={t("reports.csat.emptyTitle")}
        body={t("reports.csat.emptyBody")}
      />
    );
  }

  const dimensions = [
    { key: "unit", title: t("reports.csat.byUnit"), rows: csatBucketRows(summary.byOriginUnit, summary.satisfiedMinRating) },
    { key: "service", title: t("reports.csat.byService"), rows: csatBucketRows(summary.byService, summary.satisfiedMinRating) },
    { key: "group", title: t("reports.csat.byGroup"), rows: csatBucketRows(summary.byGroup, summary.satisfiedMinRating) },
  ] as const;

  return (
    <div className="mt-2 space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          emphasis
          label={t("reports.csat.averageLabel", { max: summary.scaleMax })}
          value={
            summary.average === null
              ? "—"
              : formatCsat(summary.average, summary.scaleMax, i18n.language)
          }
          hint={t("reports.csat.averageHint")}
        />
        <StatCard
          label={t("reports.csat.sampleLabel")}
          value={summary.count}
          hint={t("reports.csat.sampleHint", { min: summary.satisfiedMinRating })}
        />
        <StatCard
          label={t("reports.csat.targetLabel", { min: summary.satisfiedMinRating })}
          value={summary.satisfiedMinRating}
          hint={t("reports.csat.targetHint", { max: summary.scaleMax })}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {dimensions.map((dimension) => (
          <Card key={dimension.key} className="fade-in">
            <CardHeader
              title={dimension.title}
              subtitle={t("reports.csat.dimensionSubtitle")}
            />
            <div className="px-4 py-4">
              {dimension.rows.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                  {t("reports.csat.dimensionEmpty")}
                </p>
              ) : (
                <>
                  <HBars items={[...csatBucketBars(dimension.rows)]} />
                  <table className="mt-3 w-full border-t border-border/70 text-left text-[11.5px]">
                    <thead>
                      <tr className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                        <th className="py-1.5 pr-2 font-medium">{t("reports.csat.columnKey")}</th>
                        <th className="py-1.5 pr-2 font-medium">{t("reports.csat.columnSample")}</th>
                        <th className="py-1.5 font-medium">
                          {t("reports.csat.columnAverage", { max: summary.scaleMax })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dimension.rows.map((row) => (
                        <tr key={row.key} className="border-t border-border/50">
                          <td className="max-w-[180px] truncate py-1.5 pr-2 text-muted-foreground">
                            {row.key}
                          </td>
                          <td className="py-1.5 pr-2 tnum text-muted-foreground">{row.count}</td>
                          <td className="py-1.5 tnum text-foreground">
                            {formatCsat(row.average, summary.scaleMax, i18n.language)}
                            {row.meetsTarget ? null : (
                              <span className="ml-1.5 text-warning">
                                {t("reports.csat.belowTarget")}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
