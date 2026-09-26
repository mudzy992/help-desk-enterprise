import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { syncManualDirectoryCatalog } from "@/lib/directory/sync-manual-directory-catalog";
import { ApiError } from "@/services/api";
import {
  getDirectorySyncStatus,
  type DirectorySyncStatus,
} from "@/services/directory-sync-api";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const reloadStatus = useCallback(async () => {
    try {
      const next = await getDirectorySyncStatus();
      setStatus(next);
      onStatusLoaded?.(next);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : t("directory.syncLoadFailed"),
      );
    }
  }, [t, onStatusLoaded]);

  useEffect(() => {
    if (canManage) {
      void reloadStatus();
    }
  }, [canManage, reloadStatus, reloadToken]);

  const handleSync = async () => {
    setIsRunning(true);
    setErrorMessage(null);
    try {
      await syncManualDirectoryCatalog();
      await reloadStatus();
      await onSynced();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : t("directory.syncFailed"),
      );
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
          <span className="text-muted-foreground">
            {t("directory.syncLastRead")}
          </span>
          <span className="tnum text-foreground/90">
            {status?.lastSuccessfulReadAt
              ? new Date(status.lastSuccessfulReadAt).toLocaleString()
              : "—"}
          </span>
        </p>
        {errorMessage ? (
          <p role="alert" className={errorTextClassName}>
            {errorMessage}
          </p>
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
