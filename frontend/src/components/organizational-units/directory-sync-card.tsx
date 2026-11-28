import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import {
  directorySyncErrorKey,
  type DirectorySyncErrorKey,
} from "@/lib/directory/directory-sync-error-key";
import { syncManualDirectoryCatalog } from "@/lib/directory/sync-manual-directory-catalog";
import { getDirectorySyncStatus, type DirectorySyncStatus } from "@/services/directory-sync-api";

interface DirectorySyncCardProperties {
  readonly onSynced: () => Promise<void>;
  readonly canManage: boolean;
  /** Paket 1.8: lets the page show the LDAPS console for the loaded status. */
  readonly onStatusLoaded?: (status: DirectorySyncStatus) => void;
  /** Bumped by the page after an LDAPS apply so the summary is re-read. */
  readonly reloadToken?: number;
}

export function DirectorySyncCard({
  onSynced,
  canManage,
  onStatusLoaded,
  reloadToken = 0,
}: DirectorySyncCardProperties) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DirectorySyncStatus | null>(null);
  /**
   * W2.37b: this card used to render `ApiError.message`, i.e. the backend's
   * English sentence ("Directory read is disabled") verbatim in a Bosnian UI.
   * The card now stores an i18n key, so every known code has a translated
   * message in both locales (guarded by `scripts/check-api-error-i18n.mjs`).
   */
  const [errorKey, setErrorKey] = useState<DirectorySyncErrorKey | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const reloadStatus = useCallback(async () => {
    try {
      const next = await getDirectorySyncStatus();
      setStatus(next);
      onStatusLoaded?.(next);
      setErrorKey(null);
    } catch (error) {
      setErrorKey(directorySyncErrorKey(error));
    }
  }, [onStatusLoaded]);

  useEffect(() => {
    if (canManage) {
      void reloadStatus();
    }
  }, [canManage, reloadStatus, reloadToken]);

  const handleSync = async () => {
    setIsRunning(true);
    setErrorKey(null);
    try {
      await syncManualDirectoryCatalog();
      await reloadStatus();
      await onSynced();
    } catch (error) {
      setErrorKey(directorySyncErrorKey(error));
    } finally {
      setIsRunning(false);
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("directory.syncTitle")}
        subtitle={t("directory.syncSubtitle", {
          mode: status?.strategy ?? "—",
        })}
      />
      <div className="space-y-2.5 px-4 py-4 text-[12px]">
        <p className="flex justify-between">
          <span className="text-muted-foreground">{t("directory.syncSource")}</span>
          <Badge tone={status?.source === "ldaps" ? "success" : "neutral"} dot={false}>
            {status?.source === "ldaps"
              ? t("directory.syncSourceLdaps")
              : t("directory.syncSourceManual")}
          </Badge>
        </p>
        <p className="flex justify-between">
          <span className="text-muted-foreground">{t("directory.syncMode")}</span>
          <Badge tone="info" dot={false}>
            {status?.strategy ?? "—"}
          </Badge>
        </p>
        <p className="flex justify-between">
          <span className="text-muted-foreground">{t("directory.syncThrottle")}</span>
          <span className="tnum text-foreground/90">
            {status
              ? t("directory.syncThrottleValue", {
                  qps: status.maxQueriesPerSecond,
                })
              : "—"}
          </span>
        </p>
        <p className="flex justify-between">
          <span className="text-muted-foreground">{t("directory.syncCache")}</span>
          <span className="tnum text-foreground/90">
            {status
              ? t("directory.syncCacheValue", {
                  minutes: status.cacheTtlMinutes,
                  hours: status.ouTreeCacheTtlHours,
                })
              : "—"}
          </span>
        </p>
        <p className="flex justify-between">
          <span className="text-muted-foreground">{t("directory.syncLastRead")}</span>
          <span className="tnum text-foreground/90">
            {status?.lastSuccessfulReadAt
              ? new Date(status.lastSuccessfulReadAt).toLocaleString()
              : "—"}
          </span>
        </p>
        {errorKey !== null ? (
          <div role="alert" className="space-y-1">
            <p className={errorTextClassName}>{t(errorKey)}</p>
            {errorKey === "directory.ldaps.errors.DIRECTORY_READ_DISABLED" ? (
              <p className="text-[11.5px] text-muted-foreground">
                {t("directory.syncDisabledHint")}
              </p>
            ) : null}
          </div>
        ) : null}
        {status?.source === "ldaps" ? (
          <p className="text-[11.5px] text-muted-foreground">{t("directory.syncLdapsHint")}</p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isRunning}
            onClick={() => void handleSync()}
          >
            <RotateCcw size={13} /> {t("directory.syncRun")}
          </Button>
        )}
      </div>
    </Card>
  );
}
