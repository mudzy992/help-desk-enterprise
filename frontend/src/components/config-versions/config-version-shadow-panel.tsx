import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { canRunConfigVersionShadow } from "@/lib/config-versions/config-version-actions";
import type { ConfigShadowDiff, ConfigVersion } from "@/services/config-versions-types";

interface ConfigVersionShadowPanelProperties {
  readonly version: ConfigVersion;
  readonly canWrite: boolean;
  readonly isBusy: boolean;
  readonly isLoading: boolean;
  readonly result: ConfigShadowDiff | null;
  readonly onShadow: () => void;
}

export function ConfigVersionShadowPanel({
  version,
  canWrite,
  isBusy,
  isLoading,
  result,
  onShadow,
}: ConfigVersionShadowPanelProperties) {
  const { t } = useTranslation();

  if (!canWrite || !canRunConfigVersionShadow(version.status)) {
    return (
      <p className="text-[12.5px] text-muted-foreground">{t("configVersions.shadowUnavailable")}</p>
    );
  }

  return (
    <div className="grid gap-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isBusy || isLoading}
        onClick={onShadow}
      >
        {t("configVersions.shadowRun")}
      </Button>
      {isLoading ? (
        <PanelSkeleton className="mt-0" label={t("configVersions.shadowLoading")} />
      ) : null}
      {!isLoading && result !== null ? (
        <ul className="fade-in grid gap-1.5 text-[12.5px] leading-5 text-muted-foreground">
          <li>
            {t("configVersions.shadowRoutingResult", {
              count: result.routingGroupMismatches,
              sampleSize: result.sampleSize,
            })}
          </li>
          <li>
            {t("configVersions.shadowSlaResult", {
              count: result.slaRuleMismatches,
              sampleSize: result.sampleSize,
            })}
          </li>
        </ul>
      ) : null}
    </div>
  );
}
