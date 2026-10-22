import { HelpCircle, LineChart, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TrendSeries } from "@/components/charts/trend-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName, tableHeadClassName, tableRowClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";
import type { ReportTrendsResponse } from "@/services/report-trends-api";

export function slaTone(percent: number | null, target: number): "ok" | "danger" | undefined {
  if (percent === null) return undefined;
  return percent >= target ? "ok" : "danger";
}

export function FilterField({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function Tile({
  label,
  value,
  hint,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: "ok" | "warning" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-card">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tnum mt-0.5 text-[18px] font-semibold text-foreground",
          tone === "ok" && "text-ok",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint !== undefined ? (
        <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TrendCard({
  title,
  subtitle,
  how,
  labels,
  series,
  footer,
  children,
  testId,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly how: string;
  readonly labels: readonly string[];
  readonly series: readonly TrendSeries[];
  readonly footer?: string;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  const { t } = useTranslation();
  const [asTable, setAsTable] = useState(false);
  const [showHow, setShowHow] = useState(false);
  return (
    <Card className="fade-in print-avoid-break" data-testid={testId}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-1 print:hidden">
            <Button
              size="xs"
              variant="ghost"
              aria-expanded={showHow}
              onClick={() => setShowHow((current) => !current)}
            >
              <HelpCircle size={13} /> {t("reports.trends.how")}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              aria-pressed={asTable}
              onClick={() => setAsTable((current) => !current)}
            >
              {asTable ? <LineChart size={13} /> : <Table2 size={13} />}
              {asTable ? t("reports.trends.showChart") : t("reports.trends.showTable")}
            </Button>
          </div>
        }
      />
      <div className="px-4 py-4">
        {showHow ? (
          <p className="mb-3 rounded-md bg-surface-hover px-3 py-2 text-[12px] leading-5 text-muted-foreground">
            {how}
          </p>
        ) : null}
        {asTable ? <SeriesTable labels={labels} series={series} /> : children}
        {footer !== undefined ? <p className={cn(hintClassName, "mt-2")}>{footer}</p> : null}
      </div>
    </Card>
  );
}

export function SeriesTable({
  labels,
  series,
}: {
  readonly labels: readonly string[];
  readonly series: readonly TrendSeries[];
}) {
  const { t } = useTranslation();
  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 bg-surface">
          <tr className={tableHeadClassName}>
            <th className="px-2 py-1.5 text-left">{t("reports.trends.period")}</th>
            {series.map((item) => (
              <th key={item.key} className="px-2 py-1.5 text-right">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, index) => (
            <tr key={label} className={tableRowClassName}>
              <td className="px-2">{label}</td>
              {series.map((item) => {
                const value = item.values[index] ?? null;
                return (
                  <td key={item.key} className="tnum px-2 text-right">
                    {value === null ? "—" : item.format(value)}
                    {item.lowSample?.[index] === true ? " *" : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TopServicesCard({
  trends,
  locale,
}: {
  readonly trends: ReportTrendsResponse;
  readonly locale: string;
}) {
  const { t } = useTranslation();
  const top = trends.topServices;
  const max = Math.max(1, ...top.items.map((item) => item.current));
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  return (
    <Card className="fade-in print-avoid-break" data-testid="trends-card-services">
      <CardHeader
        title={t("reports.trends.cards.services.title")}
        subtitle={t("reports.trends.cards.services.subtitle")}
      />
      <div className="px-4 py-3">
        {top.items.length === 0 ? (
          <p className={hintClassName}>{t("reports.trends.cards.services.empty")}</p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className={tableHeadClassName}>
                <th className="py-1.5 text-left">{t("reports.trends.cards.services.service")}</th>
                <th className="w-[38%] py-1.5" />
                <th className="py-1.5 text-right">{t("reports.trends.cards.services.current")}</th>
                <th className="py-1.5 text-right">{t("reports.trends.cards.services.change")}</th>
              </tr>
            </thead>
            <tbody>
              {top.items.map((item) => (
                <tr key={item.serviceId} className={tableRowClassName}>
                  <td className="max-w-[180px] truncate pr-2">{item.name}</td>
                  <td className="pr-3">
                    <div className="h-2 rounded-full bg-surface-hover">
                      <div
                        className="h-2 rounded-full bg-primary/70"
                        style={{ width: `${(item.current / max) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="tnum text-right">{number(item.current)}</td>
                  <td className="text-right">
                    <ChangeBadge
                      value={item.changePercent}
                      previous={item.previous}
                      locale={locale}
                    />
                  </td>
                </tr>
              ))}
              {top.other.current > 0 || top.other.previous > 0 ? (
                <tr className={tableRowClassName}>
                  <td className="text-muted-foreground">
                    {t("reports.trends.cards.services.other")}
                  </td>
                  <td />
                  <td className="tnum text-right text-muted-foreground">
                    {number(top.other.current)}
                  </td>
                  <td />
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

export function ChangeBadge({
  value,
  previous,
  locale,
}: {
  readonly value: number | null;
  readonly previous: number;
  readonly locale: string;
}) {
  const { t } = useTranslation();
  if (value === null) {
    return (
      <span className="text-[11.5px] text-muted-foreground">
        {previous === 0 ? t("reports.trends.new") : "—"}
      </span>
    );
  }
  const formatted = `${value > 0 ? "+" : ""}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} %`;
  return (
    <Badge tone={value > 0 ? "warning" : value < 0 ? "success" : "neutral"}>{formatted}</Badge>
  );
}
