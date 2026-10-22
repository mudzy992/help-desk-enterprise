import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName, tableHeadClassName, tableRowClassName } from "@/components/ui/control";
import { formatAssetDateTime, localizedName } from "@/lib/assets/asset-view";
import type { AssetImportJob, AssetImportStatus } from "@/services/assets-api";

const statusTone: Readonly<
  Record<AssetImportStatus, "neutral" | "success" | "danger" | "warning">
> = {
  PREVIEW: "warning",
  APPLIED: "success",
  FAILED: "danger",
  EXPIRED: "neutral",
};

export function AssetImportHistory({
  jobs,
  isLoading,
}: {
  readonly jobs: readonly AssetImportJob[];
  readonly isLoading: boolean;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Card className="overflow-hidden p-0">
      <CardHeader title={t("assets.import.historyTitle")} />
      {jobs.length === 0 ? (
        <p className={`p-4 ${hintClassName}`}>
          {isLoading ? t("ui.loading") : t("assets.import.historyEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">{t("assets.import.historyTitle")}</caption>
            <thead>
              <tr className={tableHeadClassName}>
                <th scope="col" className="px-3 py-2 text-left">
                  {t("assets.import.historyFile")}
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  {t("assets.fields.type")}
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  {t("assets.import.historyStatus")}
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  {t("assets.import.historyResult")}
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  {t("assets.import.historyWhen")}
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className={tableRowClassName}>
                  <td className="px-3 py-2">
                    <span className="block">{job.fileName}</span>
                    {job.createdBy ? (
                      <span className="block text-[11.5px] text-muted-foreground">
                        {job.createdBy}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {job.type ? localizedName(job.type, i18n.language) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={statusTone[job.status]}>
                      {t(`assets.import.statuses.${job.status}` as const)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {job.totals.applied
                      ? t("assets.import.appliedBody", job.totals.applied)
                      : t("assets.import.previewResult", {
                          create: job.totals.create,
                          update: job.totals.update,
                          errors: job.totals.errors,
                        })}
                  </td>
                  <td className="px-3 py-2">
                    {formatAssetDateTime(job.appliedAt ?? job.createdAt, i18n.language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
