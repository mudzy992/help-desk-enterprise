import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FlaskConical, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, hintClassName, tableHeadClassName, tableRowClassName } from "@/components/ui/control";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { formatAssetDateTime, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { ApiError } from "@/services/api";
import {
  assetDirectoryQueryKeys,
  assetQueryKeys,
  getAssetDirectorySyncStatus,
  runAssetDirectorySync,
  type AssetDirectoryConflict,
  type AssetDirectorySyncReport,
  type AssetDirectorySyncTotals,
} from "@/services/assets-api";

const totalKeys = ["seen", "create", "update", "adopt", "missing", "conflicts"] as const satisfies readonly (keyof AssetDirectorySyncTotals)[];

/** Paket 3.2 (§12): AD computers — status, dry-run and manual sync (admins). */
export function AssetDirectorySyncCard() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const statusQuery = useQuery({ queryKey: assetDirectoryQueryKeys.status, queryFn: getAssetDirectorySyncStatus, retry: false });
  const [report, setReport] = useState<AssetDirectorySyncReport | null>(null);
  const [pending, setPending] = useState<"dry" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = statusQuery.data;

  async function run(dryRun: boolean) {
    setPending(dryRun ? "dry" : "run");
    setError(null);
    try {
      const result = await runAssetDirectorySync(dryRun);
      setReport(result);
      if (!dryRun) {
        toast({ tone: "success", title: t("assets.directory.appliedTitle"), description: t("assets.directory.appliedBody", result.applied ?? { created: 0, updated: 0, failed: 0 }) });
        void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
      } else {
        void queryClient.invalidateQueries({ queryKey: assetDirectoryQueryKeys.status });
      }
    } catch (caught) {
      const detail = caught instanceof ApiError && caught.message && caught.message !== caught.code ? ` (${caught.message})` : "";
      setError(`${t(mapAssetError(caught) ?? mapApiError(caught))}${detail}`);
    } finally {
      setPending(null);
    }
  }

  const totals = report?.totals ?? status?.lastRun?.totals ?? null;
  const conflicts: readonly AssetDirectoryConflict[] = report?.conflicts ?? status?.lastRun?.conflicts ?? [];

  return (
    <Card className="p-0">
      <CardHeader
        title={t("assets.directory.title")}
        subtitle={t("assets.directory.subtitle")}
        actions={
          status ? (
            <Badge tone={status.enabled ? "success" : "neutral"} dot>
              {status.enabled ? t("assets.directory.enabled", { hours: status.intervalHours }) : t("assets.directory.disabled")}
            </Badge>
          ) : undefined
        }
      />
      <div className="grid gap-3 p-4">
        {statusQuery.isLoading ? <p className={hintClassName}>{t("ui.loading")}</p> : null}
        {status ? (
          <p className={hintClassName}>
            {t("assets.directory.summary", { assets: status.directoryAssets, missing: status.missingAssets })}{" "}
            {status.lastApplied ? t("assets.directory.lastApplied", { time: formatAssetDateTime(status.lastApplied.at, i18n.language) }) : t("assets.directory.neverApplied")}
          </p>
        ) : null}
        {status && !status.configured ? <p className={hintClassName}>{t("assets.directory.notConfigured")}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending !== null || status?.configured === false} onClick={() => void run(true)}>
            <FlaskConical size={14} aria-hidden="true" />
            {pending === "dry" ? t("ui.loading") : t("assets.directory.dryRun")}
          </Button>
          <Button variant="primary" size="sm" disabled={pending !== null || !status?.enabled || !status.configured} onClick={() => void run(false)}>
            <RefreshCw size={14} aria-hidden="true" />
            {pending === "run" ? t("ui.loading") : t("assets.directory.runNow")}
          </Button>
          {status && !status.enabled ? <span className={hintClassName}>{t("assets.directory.enableHint")}</span> : null}
        </div>

        {error ? (
          <p role="alert" className={errorTextClassName}>
            {error}
          </p>
        ) : null}

        {totals ? (
          <section aria-labelledby="asset-directory-result" className="grid gap-2">
            <h3 id="asset-directory-result" className="text-[13px] font-semibold text-foreground">
              {report
                ? report.dryRun
                  ? t("assets.directory.dryRunResult")
                  : t("assets.directory.runResult")
                : status?.lastRun
                  ? t("assets.directory.lastRun", { time: formatAssetDateTime(status.lastRun.at, i18n.language), kind: status.lastRun.dryRun ? t("assets.directory.kindDry") : t("assets.directory.kindApplied") })
                  : null}
            </h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              {totalKeys.map((key) => (
                <StatCard key={key} label={t(`assets.directory.totals.${key}` as const)} value={totals[key]} />
              ))}
            </div>
            {(report?.missingGuardTripped ?? status?.lastRun?.missingGuardTripped) ? (
              <p className={errorTextClassName}>{t("assets.directory.guardTripped", { count: report?.wouldFlagMissing ?? 0 })}</p>
            ) : null}
          </section>
        ) : null}

        {conflicts.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border/70">
            <table className="w-full text-[12.5px]">
              <caption className="px-3 py-2 text-left text-[12.5px] font-medium text-foreground">{t("assets.directory.conflictsTitle", { count: conflicts.length })}</caption>
              <thead>
                <tr className={tableHeadClassName}>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.directory.asset")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.directory.assigned")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.directory.suggested")}</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((conflict) => (
                  <tr key={conflict.assetId} className={tableRowClassName}>
                    <td className="px-3 py-2">
                      <Link className="underline-offset-2 hover:underline" to={`/assets/${encodeURIComponent(conflict.assetId)}`}>
                        {conflict.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{conflict.assignedUser ?? "—"}</td>
                    <td className="px-3 py-2">
                      {conflict.suggestedUser ?? "—"}{" "}
                      <span className="text-muted-foreground">({t(`assets.directory.matchedBy.${conflict.matchedBy}` as "assets.directory.matchedBy.managedBy", { defaultValue: conflict.matchedBy })})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {report && report.skipped.length > 0 ? (
          <details className="text-[12.5px]">
            <summary className="cursor-pointer text-foreground">{t("assets.directory.skippedTitle", { count: report.skipped.length })}</summary>
            <ul className="mt-1 list-disc pl-5">
              {report.skipped.map((skip) => (
                <li key={skip.externalId}>
                  {skip.name} — {t(`assets.directory.skipReasons.${skip.reason}` as const)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {report && report.preview.length > 0 ? (
          <details className="text-[12.5px]">
            <summary className="cursor-pointer text-foreground">{t("assets.directory.previewTitle", { count: report.preview.length })}</summary>
            <ul className="mt-1 list-disc pl-5">
              {report.preview.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  {t(`assets.directory.actions.${item.action}` as "assets.directory.actions.create", { defaultValue: item.action })}: {item.name}
                  {item.changes.length > 0 ? <span className="text-muted-foreground"> ({item.changes.join(", ")})</span> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </Card>
  );
}
