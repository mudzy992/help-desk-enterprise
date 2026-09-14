import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { cn } from "@/lib/utils";
import { configVersionBadgeTone } from "@/lib/config-versions/config-version-display";
import type { ConfigVersion } from "@/services/config-versions-types";

interface ConfigVersionListProperties {
  readonly versions: readonly ConfigVersion[];
  readonly selectedId: string | null;
  readonly onSelect: (versionId: string) => void;
}

export function ConfigVersionList({
  versions,
  selectedId,
  onSelect,
}: ConfigVersionListProperties) {
  const { t, i18n } = useTranslation();

  return (
    <div className={tableWrapClassName}>
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
          <tr>
            <th className="px-3 py-2">{t("configVersions.columnVersion")}</th>
            <th className="px-3 py-2">{t("configVersions.columnStatus")}</th>
            <th className="px-3 py-2">{t("configVersions.columnNotes")}</th>
            <th className="px-3 py-2">{t("configVersions.columnCreated")}</th>
            <th className="px-3 py-2">{t("configVersions.columnActivated")}</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr
              key={version.id}
              className={cn(
                tableRowClassName,
                "cursor-pointer",
                selectedId === version.id ? "bg-primary/10 hover:bg-primary/10" : "",
              )}
              onClick={() => onSelect(version.id)}
            >
              <td className="px-3 tnum">v{version.version}</td>
              <td className="px-3">
                <Badge tone={configVersionBadgeTone(version.status)}>
                  {t(`configVersions.statuses.${version.status}`)}
                </Badge>
              </td>
              <td className="max-w-[280px] truncate px-3 text-[12px] text-muted-foreground">
                {version.releaseNotes ?? t("configVersions.noNotes")}
              </td>
              <td className="px-3">
                <RelativeTime value={version.createdAt} locale={i18n.language} />
              </td>
              <td className="px-3">
                {version.activatedAt ? (
                  <RelativeTime value={version.activatedAt} locale={i18n.language} />
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
