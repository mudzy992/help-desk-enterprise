import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/ui/card";
import { formatNumber } from "@/lib/reports/report-format";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  SlaComplianceBreakdownRow,
  SlaComplianceResponse,
} from "@/services/sla-types";

interface SlaComplianceCardProperties {
  readonly compliance: SlaComplianceResponse | null;
  readonly isLoading: boolean;
  readonly scopeLabel: string | null;
}

export function SlaComplianceCard({
  compliance,
  isLoading,
  scopeLabel,
}: SlaComplianceCardProperties) {
  const { t, i18n } = useTranslation();
  const profileNames = new Map(
    (compliance?.profiles ?? []).map((profile) => [profile.slaProfileId, profile.profileName]),
  );

  return (
    <Card>
      <CardHeader
        title={t("sla.complianceTitle")}
        subtitle={
          scopeLabel === null
            ? t("sla.complianceHint")
            : t("sla.complianceScopedHint", { unit: scopeLabel })
        }
      />
      <div className="space-y-5 px-4 py-4">
        {compliance === null ? (
          <EmptyState
            title={isLoading ? t("sla.complianceLoadingTitle") : t("sla.complianceEmptyTitle")}
            body={
              isLoading
                ? t("sla.complianceLoadingBody")
                : t("sla.complianceScopeEmptyBody")
            }
          />
        ) : (
          <>
            <section aria-labelledby="sla-open-breaches-heading">
              <h3
                id="sla-open-breaches-heading"
                className="mb-2 text-[12px] font-semibold text-foreground"
              >
                {t("sla.openBreachHeading")}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <BreachMetric
                  label={t("sla.openBreachResponse")}
                  value={formatNumber(compliance.openBreached.response, i18n.language)}
                />
                <BreachMetric
                  label={t("sla.openBreachResolution")}
                  value={formatNumber(compliance.openBreached.resolution, i18n.language)}
                />
              </div>
            </section>

            {compliance.profiles.every((profile) => profile.sampleCount === 0) ? (
              <p className="text-[11px] text-muted-foreground">
                {t("sla.complianceEmptyBody")}
              </p>
            ) : null}
            <ComplianceTable
              title={t("sla.complianceByProfile")}
              columns={[
                t("sla.complianceProfile"),
                t("sla.complianceSample"),
                t("sla.complianceResponse"),
                t("sla.complianceResolution"),
              ]}
            >
              {compliance.profiles.map((profile) => (
                <tr key={profile.slaProfileId}>
                  <th scope="row" className="max-w-64 truncate text-left font-medium text-foreground">
                    {profile.profileName}
                  </th>
                  <td>{formatNumber(profile.sampleCount, i18n.language)}</td>
                  <td>{formatPercent(profile.responseCompliancePercent, i18n.language)}</td>
                  <td>{formatPercent(profile.resolutionCompliancePercent, i18n.language)}</td>
                </tr>
              ))}
            </ComplianceTable>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <DimensionTable
                title={t("sla.complianceByUnit")}
                rows={compliance.byUnit}
                profileNames={profileNames}
                locale={i18n.language}
                unassignedLabel={t("tickets.assignment.unassigned")}
              />
              <DimensionTable
                title={t("sla.complianceByService")}
                rows={compliance.byService}
                profileNames={profileNames}
                locale={i18n.language}
                unassignedLabel={t("tickets.assignment.unassigned")}
              />
              <DimensionTable
                title={t("sla.complianceByGroup")}
                rows={compliance.byGroup}
                profileNames={profileNames}
                locale={i18n.language}
                unassignedLabel={t("tickets.assignment.unassigned")}
              />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function BreachMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tnum mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ComplianceTable({
  title,
  columns,
  children,
}: {
  readonly title: string;
  readonly columns: readonly string[];
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-[12px] font-semibold text-foreground">{title}</h3>
      <div className="max-h-72 overflow-auto rounded-md border border-border">
        <table className="w-full min-w-[440px] border-collapse text-[11px]">
          <thead className="sticky top-0 bg-elevated text-left text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-2.5 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function DimensionTable({
  title,
  rows,
  profileNames,
  locale,
  unassignedLabel,
}: {
  readonly title: string;
  readonly rows: readonly SlaComplianceBreakdownRow[];
  readonly profileNames: ReadonlyMap<string, string>;
  readonly locale: string;
  readonly unassignedLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-[12px] font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-md border border-border px-3 py-4 text-[11px] text-muted-foreground">
          {t("sla.complianceBreakdownEmpty")}
        </p>
      ) : (
        <div className="max-h-72 overflow-auto rounded-md border border-border">
          <table className="w-full min-w-[560px] border-collapse text-[11px]">
            <thead className="sticky top-0 bg-elevated text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-2.5 py-2 font-medium">
                  {t("sla.complianceProfile")}
                </th>
                <th scope="col" className="px-2.5 py-2 font-medium">
                  {t("sla.complianceDimension")}
                </th>
                <th scope="col" className="px-2.5 py-2 font-medium">
                  {t("sla.complianceSample")}
                </th>
                <th scope="col" className="px-2.5 py-2 font-medium">
                  {t("sla.complianceResponse")}
                </th>
                <th scope="col" className="px-2.5 py-2 font-medium">
                  {t("sla.complianceResolution")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={`${row.slaProfileId}:${row.dimensionId ?? "unassigned"}`}>
                  <td className="max-w-32 truncate px-2.5 py-2 text-muted-foreground">
                    {profileNames.get(row.slaProfileId) ?? row.slaProfileId}
                  </td>
                  <th scope="row" className="max-w-40 truncate px-2.5 py-2 text-left font-medium text-foreground">
                    {row.dimensionId === null
                      ? unassignedLabel
                      : row.dimensionName ?? row.dimensionId}
                  </th>
                  <td className="px-2.5 py-2 text-muted-foreground">{formatNumber(row.sampleCount, locale)}</td>
                  <td className="px-2.5 py-2 text-muted-foreground">
                    {formatPercent(row.responseCompliancePercent, locale)}
                  </td>
                  <td className="px-2.5 py-2 text-muted-foreground">
                    {formatPercent(row.resolutionCompliancePercent, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatPercent(value: number | null, locale: string): string {
  return value === null ? "—" : `${formatNumber(value, locale)}%`;
}
