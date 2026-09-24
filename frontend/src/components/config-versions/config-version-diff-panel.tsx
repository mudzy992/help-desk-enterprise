import { GitCompare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { selectClassName } from "@/components/ui/control";
import { formatConfigDiffChange } from "@/lib/config-versions/config-version-display";
import type { ConfigVersion } from "@/services/config-versions-types";
import type { useConfigVersionDiff } from "@/lib/config-versions/use-config-version-diff";

interface ConfigVersionDiffPanelProperties {
  readonly versions: readonly ConfigVersion[];
  readonly selectedId: string | null;
  readonly againstId: string | null;
  readonly onAgainstChange: (againstId: string | null) => void;
  readonly diffState: ReturnType<typeof useConfigVersionDiff>;
}

export function ConfigVersionDiffPanel({
  versions,
  selectedId,
  againstId,
  onAgainstChange,
  diffState,
}: ConfigVersionDiffPanelProperties) {
  const { t } = useTranslation();
  const options = versions.filter((version) => version.id !== selectedId);

  return (
    <div className="grid gap-3">
      <label className="grid gap-1.5 text-[12.5px] font-medium text-foreground">
        {t("configVersions.compareAgainst")}
        <select
          className={selectClassName}
          value={againstId ?? ""}
          disabled={selectedId === null}
          onChange={(event) => onAgainstChange(event.target.value || null)}
        >
          <option value="">{t("configVersions.comparePlaceholder")}</option>
          {options.map((version) => (
            <option key={version.id} value={version.id}>
              v{version.version} · {t(`configVersions.statuses.${version.status}`)}
            </option>
          ))}
        </select>
      </label>
      {diffState.errorKey ? (
        <p className="text-[12.5px] text-danger" role="alert">
          {t(diffState.errorKey)}
        </p>
      ) : null}
      {diffState.isLoading ? (
        <PanelSkeleton className="mt-0" label={t("configVersions.diffLoading")} />
      ) : null}
      {!diffState.isLoading && diffState.diff === null ? (
        <EmptyState
          icon={<GitCompare size={18} strokeWidth={1.8} />}
          title={t("configVersions.diffEmptyTitle")}
          body={t("configVersions.diffEmptyBody")}
        />
      ) : null}
      {diffState.diff !== null && diffState.diff.changes.length === 0 ? (
        <EmptyState
          title={t("configVersions.diffUnchangedTitle")}
          body={t("configVersions.diffUnchangedBody")}
        />
      ) : null}
      {diffState.diff !== null && diffState.diff.changes.length > 0 ? (
        <ul className="fade-in grid gap-1.5 font-mono text-[12px] leading-5 text-muted-foreground">
          {diffState.diff.changes.map((change) => (
            <li key={change.path}>{formatConfigDiffChange(change)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
