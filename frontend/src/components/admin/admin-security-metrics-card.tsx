import { Activity, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DualAreaChart } from "@/components/charts/dual-area-chart";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError } from "@/lib/map-api-error";
import { getLoginSecurityMetrics } from "@/services/security-api";

/**
 * Paket 5.4.0-e (M2): "Nadzor → Promašene prijave / 429". The counters are
 * aggregate, per-minute buckets without any PII, so the card can show the
 * whole last hour as it is. Blocked sign-ins (429) and the per-account delays
 * share one chart because they answer the same question — is someone pushing
 * against the login, or did a calibration change trip real people?
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
      <div className="space-y-3 px-4 py-4">
        {query.isLoading ? <PanelSkeleton label={t("admin.ops.securityMetrics.loading")} /> : null}
        {query.isError ? (
          <ApiErrorText messageKey={mapApiError(query.error)} />
        ) : null}
        {query.data ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={(blocked?.total ?? 0) > 0 ? "danger" : "neutral"} dot={false}>
                <Activity size={10} />
                {t("admin.ops.securityMetrics.total")}:{" "}
                <span className="tnum">{blocked?.total ?? 0}</span>
              </Badge>
              <Badge tone="neutral" dot={false}>
                {t("admin.ops.securityMetrics.peak")}:{" "}
                <span className="tnum">{blocked?.peakPerMinute ?? 0}</span>
              </Badge>
              <Badge tone={(mfaFailures?.total ?? 0) > 0 ? "warning" : "neutral"} dot={false}>
                {t("admin.ops.securityMetrics.mfaFailures")}:{" "}
                <span className="tnum">{mfaFailures?.total ?? 0}</span>
              </Badge>
              <Badge tone="neutral" dot={false}>
                {t("admin.ops.securityMetrics.hibpSkipped")}:{" "}
                <span className="tnum">{hibpSkipped?.total ?? 0}</span>
              </Badge>
            </div>
            {hasEvents ? (
              <section className="grid gap-2">
                <h4 className={sectionTitleClassName}>{t("admin.ops.securityMetrics.chartTitle")}</h4>
                <DualAreaChart
                  height={160}
                  aLabel={t("admin.ops.securityMetrics.series429")}
                  bLabel={t("admin.ops.securityMetrics.seriesDelays")}
                  data={(blocked?.points ?? []).map((point, index) => ({
                    label: timeLabel(point.at),
                    a: point.count,
                    b: delayed?.points[index]?.count ?? 0,
                  }))}
                />
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
