import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, hintClassName, tableHeadClassName, tableRowClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { assetStatusKeys, formatAssetDate, formatAssetDateTime, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { assetQueryKeys, getAssetOverview, type AssetOverview } from "@/services/assets-api";

const expiringKindKeys = {
  warranty: "assets.overview.kinds.warranty",
  contract: "assets.overview.kinds.contract",
  license: "assets.overview.kinds.license",
} as const;

const holderReasonKeys = {
  inactive: "assets.overview.reasons.inactive",
  other_unit: "assets.overview.reasons.other_unit",
} as const;

/**
 * Paket 3.2 C9b: asset manager overview. Every card is a real table (numbers
 * are text, bars are decoration only), so nothing depends on colour or on a
 * chart being readable by a screen reader.
 */
export function AssetOverviewPanel() {
  const { t, i18n } = useTranslation();
  const query = useQuery({ queryKey: assetQueryKeys.overview, queryFn: getAssetOverview, retry: false, staleTime: 60_000 });
  if (query.isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (query.error || !query.data) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapAssetError(query.error) ?? mapApiError(query.error))}
      </p>
    );
  }
  const data = query.data;
  const language = i18n.language;
  return (
    <div className="grid gap-4">
      <p className={hintClassName}>{t("assets.overview.generatedAt", { when: formatAssetDateTime(data.generatedAt, language) })}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <StatusCard data={data} />
        <OverviewCard title={t("assets.overview.expiringTitle", { days: data.expiring.days })} subtitle={t("assets.overview.total", { count: data.expiring.total })}>
          {data.expiring.items.length === 0 ? (
            <Empty text={t("assets.overview.expiringEmpty")} />
          ) : (
            <OverviewTable
              caption={t("assets.overview.expiringTitle", { days: data.expiring.days })}
              headers={[t("assets.overview.columns.kind"), t("assets.overview.columns.name"), t("assets.overview.columns.unit"), t("assets.overview.columns.endsAt")]}
              rows={data.expiring.items.map((item) => [
                t(expiringKindKeys[item.kind]),
                <span key="name">
                  {item.name}
                  {item.reference ? <span className="block text-[11.5px] text-muted-foreground">{item.reference}</span> : null}
                </span>,
                item.unitName,
                formatAssetDate(item.endsAt, language),
              ])}
            />
          )}
        </OverviewCard>
        <OverviewCard title={t("assets.overview.licensesTitle")} subtitle={t("assets.overview.total", { count: data.overAllocatedLicenses.total })}>
          {data.overAllocatedLicenses.items.length === 0 ? (
            <Empty text={t("assets.overview.licensesEmpty")} />
          ) : (
            <OverviewTable
              caption={t("assets.overview.licensesTitle")}
              headers={[t("assets.overview.columns.product"), t("assets.overview.columns.unit"), t("assets.overview.columns.usedOfSeats")]}
              rows={data.overAllocatedLicenses.items.map((item) => [
                item.productName,
                item.unitName,
                <Badge key="used" tone="warning">
                  {item.used} / {item.seats ?? "—"}
                </Badge>,
              ])}
            />
          )}
        </OverviewCard>
        <OverviewCard title={t("assets.overview.topTitle", { days: data.topAssets.days })}>
          {data.topAssets.items.length === 0 ? (
            <Empty text={t("assets.overview.topEmpty")} />
          ) : (
            <OverviewTable
              caption={t("assets.overview.topTitle", { days: data.topAssets.days })}
              headers={[t("assets.overview.columns.asset"), t("assets.overview.columns.unit"), t("assets.overview.columns.tickets"), t("assets.overview.columns.open")]}
              rows={data.topAssets.items.map((item) => [
                <Link key="asset" to={`/assets/${encodeURIComponent(item.assetId)}`} className="text-link underline-offset-2 hover:underline">
                  {item.assetName}
                  <span className="block text-[11.5px] text-muted-foreground">
                    {item.typeName} · {item.assetTag}
                  </span>
                </Link>,
                item.unitName,
                String(item.tickets),
                String(item.openTickets),
              ])}
            />
          )}
        </OverviewCard>
        <OverviewCard title={t("assets.overview.directoryTitle")} subtitle={t("assets.overview.directorySubtitle")}>
          <dl className="grid grid-cols-2 gap-3 p-4 text-[12.5px]">
            <div>
              <dt className="text-muted-foreground">{t("assets.overview.directorySuggested")}</dt>
              <dd className="tnum text-[20px] font-semibold text-foreground">{data.directory.suggested}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("assets.overview.directoryMissing")}</dt>
              <dd className="tnum text-[20px] font-semibold text-foreground">{data.directory.missing}</dd>
            </div>
          </dl>
        </OverviewCard>
        <OverviewCard title={t("assets.overview.holdersTitle")} subtitle={t("assets.overview.total", { count: data.holders.total })}>
          {data.holders.items.length === 0 ? (
            <Empty text={t("assets.overview.holdersEmpty")} />
          ) : (
            <OverviewTable
              caption={t("assets.overview.holdersTitle")}
              headers={[t("assets.overview.columns.asset"), t("assets.overview.columns.holder"), t("assets.overview.columns.reason")]}
              rows={data.holders.items.map((item) => [
                <span key="asset">
                  {item.assetName}
                  <span className="block text-[11.5px] text-muted-foreground">{item.assetTag}</span>
                </span>,
                <span key="holder">
                  {item.holderName}
                  {item.holderUnitName ? <span className="block text-[11.5px] text-muted-foreground">{item.holderUnitName}</span> : null}
                </span>,
                t(holderReasonKeys[item.reason]),
              ])}
            />
          )}
        </OverviewCard>
      </div>
    </div>
  );
}

function StatusCard({ data }: { readonly data: AssetOverview }) {
  const { t } = useTranslation();
  const total = data.byStatus.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <OverviewCard title={t("assets.overview.statusTitle")} subtitle={t("assets.overview.total", { count: total })}>
      {data.byStatus.length === 0 ? (
        <Empty text={t("assets.overview.statusEmpty")} />
      ) : (
        <OverviewTable
          caption={t("assets.overview.statusTitle")}
          headers={[t("assets.overview.columns.status"), t("assets.overview.columns.count")]}
          rows={data.byStatus.map((entry) => [
            t(assetStatusKeys[entry.status]),
            <span key="count" className="flex items-center gap-2">
              <span className="tnum w-10 text-right">{entry.count}</span>
              <span aria-hidden="true" className="h-1.5 rounded-full bg-primary/60" style={{ width: `${total === 0 ? 0 : Math.max(2, Math.round((entry.count / total) * 120))}px` }} />
            </span>,
          ])}
        />
      )}
    </OverviewCard>
  );
}

function OverviewCard({ title, subtitle, children }: { readonly title: string; readonly subtitle?: string; readonly children: ReactNode }) {
  return (
    <Card className="p-0">
      <CardHeader title={title} subtitle={subtitle} />
      {children}
    </Card>
  );
}

function Empty({ text }: { readonly text: string }) {
  return <p className={`p-4 ${hintClassName}`}>{text}</p>;
}

function OverviewTable({ caption, headers, rows }: { readonly caption: string; readonly headers: readonly string[]; readonly rows: readonly (readonly ReactNode[])[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={tableHeadClassName}>
            {headers.map((header) => (
              <th key={header} scope="col" className="px-3 py-2 text-left">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index} className={tableRowClassName}>
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
