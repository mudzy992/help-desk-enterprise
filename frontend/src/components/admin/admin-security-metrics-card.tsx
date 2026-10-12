import { Activity, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MinuteBarsChart } from "@/components/charts/minute-bars-chart";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { alignMinuteSeries } from "@/lib/charts/minute-series";
import { mapApiError } from "@/lib/map-api-error";
import { getLoginSecurityMetrics } from "@/services/security-api";

/**
 * Paket 5.4.0-e (M2) + 5.4.0-e.2 (UI polish): „Nadzor → Promašene prijave / 429".
 *
 * The counters are aggregate, per-minute buckets without any PII, so the card
 * can show the whole last hour as it is. Blocked sign-ins (429) and the
 * per-account delays share one chart because they answer the same question — is
 * someone pushing against the login, or did a calibration change trip real
 * people?
 *
 * Review 2026-10-12: the counters used to be badges in one wrapping row; a badge
 * never breaks its line, so long labels pushed the row out of the card. They are
 * four equal tiles in a grid now — the numbers line up, and nothing can escape
 * the surface at any width.
 *
 * Review 2026-10-12 (second pass): the dual **area** chart did not fit this data.
 * It rendered one x-axis label per bucket, and with 60 per-minute buckets that
 * row was wider than the card, which gave the whole page a horizontal scrollbar.
 * The two series also shared an index, so one missing bucket shifted them
 * against each other. Both are fixed: the data is aligned by timestamp in
 * `alignMinuteSeries`, and it is drawn as two minute bar strips whose bars are
 * `flex-1` — hour view kept, nothing can exceed the card.
 */
export function AdminSecurityMetricsCard() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "security", "metrics", "last-hour"],
    queryFn: getLoginSecurityMetrics,
  });

  const timeLabel = (at: string) =>
    new Date(at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  const metrics = query.data?.metrics;
  const blocked = metrics?.["login-429"];
  const delayed = metrics?.["login-account-delays"];
  const mfaFailures = metrics?.["mfa-failures"];
  const hibpSkipped = metrics?.["hibp-skipped"];
  const hasEvents =
    (blocked?.total ?? 0) + (delayed?.total ?? 0) + (mfaFailures?.total ?? 0) + (hibpSkipped?.total ?? 0) > 0;

  const tiles = [
    { key: "blocks", label: t("admin.ops.securityMetrics.tileBlocks"), value: blocked?.total ?? 0 },
    { key: "peak", label: t("admin.ops.securityMetrics.peak"), value: blocked?.peakPerMinute ?? 0 },
    { key: "mfa", label: t("admin.ops.securityMetrics.mfaFailures"), value: mfaFailures?.total ?? 0 },
    { key: "hibp", label: t("admin.ops.securityMetrics.hibpSkipped"), value: hibpSkipped?.total ?? 0 },
  ] as const;

  return (
    <Card className="fade-in" data-testid="admin-security-metrics-card">
      <CardHeader
        title={t("admin.ops.securityMetrics.title")}
        subtitle={t("admin.ops.securityMetrics.body")}
        actions={
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["admin", "security", "metrics"] })}
          >
            <RefreshCw size={12} />
            {t("admin.ops.securityMetrics.refresh")}
          </Button>
        }
      />
      <div className="min-w-0 space-y-3 px-4 py-4">
        {query.isLoading ? <PanelSkeleton label={t("admin.ops.securityMetrics.loading")} /> : null}
        {query.isError ? <ApiErrorText messageKey={mapApiError(query.error)} /> : null}
        {query.data ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tiles.map((tile) => (
                <div
                  key={tile.key}
                  data-testid={`admin-security-metric-${tile.key}`}
                  className="min-w-0 rounded-lg border border-border/70 bg-elevated/40 px-3 py-2"
                >
                  <p className="truncate text-[11px] text-muted-foreground" title={tile.label}>
                    {tile.label}
                  </p>
                  <p className="tnum mt-0.5 text-[17px] font-semibold leading-6 text-foreground">
                    {tile.value}
                  </p>
                </div>
              ))}
            </div>
            {hasEvents ? (
              <section className="grid min-w-0 gap-2">
                <h4 className={`${sectionTitleClassName} flex items-center gap-1.5`}>
                  <Activity size={13} className="text-link" />
                  {t("admin.ops.securityMetrics.chartTitle")}
                </h4>
                <div className="min-w-0">
                  <MinuteBarsChart
                    height={56}
                    aLabel={t("admin.ops.securityMetrics.series429")}
                    bLabel={t("admin.ops.securityMetrics.seriesDelays")}
                    data={alignMinuteSeries(blocked?.points, delayed?.points).map((point) => ({
                      label: timeLabel(point.at),
                      a: point.a,
                      b: point.b,
                    }))}
                  />
                </div>
              </section>
            ) : (
              <p className={hintClassName}>{t("admin.ops.securityMetrics.empty")}</p>
            )}
          </>
        ) : null}
      </div>
    </Card>
  );
}
