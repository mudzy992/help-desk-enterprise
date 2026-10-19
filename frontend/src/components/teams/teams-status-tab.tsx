import { CheckCircle2, Download, RefreshCw, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { RelativeTime } from "@/components/ui/relative-time";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { useTeamsAsyncAction } from "@/lib/teams/use-teams-async-action";
import {
  checkTeamsReadiness,
  downloadTeamsPackage,
  type TeamsReadiness,
  type TeamsStatus,
} from "@/services/teams-api";

const modeKeys = {
  off: "teamsAdmin.mode.off",
  simulator: "teamsAdmin.mode.simulator",
  live: "teamsAdmin.mode.live",
} as const;
const readinessKeys = {
  addon: "teamsAdmin.readiness.checks.addon",
  tenant: "teamsAdmin.readiness.checks.tenant",
  appId: "teamsAdmin.readiness.checks.appId",
  credential: "teamsAdmin.readiness.checks.credential",
  token: "teamsAdmin.readiness.checks.token",
  publicUrl: "teamsAdmin.readiness.checks.publicUrl",
  endpoint: "teamsAdmin.readiness.checks.endpoint",
  simulatorSecret: "teamsAdmin.readiness.checks.simulatorSecret",
} as const;

function fact(label: string, value: ReactNode) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-[12.5px] last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

export function TeamsStatusTab({
  status,
  onRefresh,
}: {
  readonly status: TeamsStatus;
  readonly onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [readiness, setReadiness] = useState<TeamsReadiness | null>(null);
  const { busy, error: errorKey, run } = useTeamsAsyncAction();
  const locale = i18n.language;

  const runReadiness = async () => {
    const next = await run(checkTeamsReadiness);
    if (next !== undefined) {
      setReadiness(next);
      onRefresh();
    }
  };

  const runPackage = async (packageLocale: "bs" | "en") => {
    const file = await run(() => downloadTeamsPackage(packageLocale));
    if (file !== undefined) triggerBlobDownload(file.blob, file.fileName);
  };

  const time = (value: string | null) =>
    value ? <RelativeTime value={value} locale={locale} /> : t("teamsAdmin.status.never");

  return (
    <div className="fade-in grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={t("teamsAdmin.status.title")}
          actions={
            <Button
              size="xs"
              variant="ghost"
              onClick={onRefresh}
              aria-label={t("teamsAdmin.refresh")}
            >
              <RefreshCw />
            </Button>
          }
        />
        <div className="px-4 py-3.5">
          {fact(
            t("teamsAdmin.status.mode"),
            <Badge
              tone={status.mode === "off" ? "neutral" : status.mode === "live" ? "success" : "info"}
              dot
            >
              {t(modeKeys[status.mode])}
            </Badge>,
          )}
          {fact(t("teamsAdmin.status.configuredMode"), t(modeKeys[status.configuredMode]))}
          {fact(t("teamsAdmin.status.personal"), status.personalConversations)}
          {fact(t("teamsAdmin.status.channels"), status.channelConversations)}
          {fact(t("teamsAdmin.status.linkedGroups"), status.linkedGroups)}
          {fact(t("teamsAdmin.status.lastInbound"), time(status.lastInboundAt))}
          {fact(t("teamsAdmin.status.lastDelivery"), time(status.lastDeliveryAt))}
          {fact(
            t("teamsAdmin.status.failed"),
            <Badge tone={status.failedDeliveries > 0 ? "danger" : "neutral"}>
              {status.failedDeliveries}
            </Badge>,
          )}
          {fact(
            t("teamsAdmin.status.endpoint"),
            <span className="break-all font-mono text-[11.5px]">
              {status.messagingEndpoint ?? "—"}
            </span>,
          )}
          {!status.addonEnabled ? (
            <p className={`mt-3 ${hintClassName}`}>
              {t("teamsAdmin.status.addonOff")}{" "}
              <Link
                className="text-link underline-offset-4 hover:underline"
                to="/admin?tab=settings"
              >
                {t("teamsAdmin.status.openSettings")}
              </Link>
            </p>
          ) : null}
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader
            title={t("teamsAdmin.readiness.title")}
            subtitle={t("teamsAdmin.readiness.subtitle")}
            actions={
              <Button
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() => void runReadiness()}
              >
                {t("teamsAdmin.readiness.run")}
              </Button>
            }
          />
          <div className="px-4 py-3.5">
            {readiness === null ? (
              <p className={hintClassName}>{t("teamsAdmin.readiness.notRun")}</p>
            ) : (
              <ul className="space-y-1.5" aria-label={t("teamsAdmin.readiness.title")}>
                {readiness.checks.map((check) => (
                  <li key={check.key} className="flex items-start gap-2 text-[12.5px]">
                    {check.ok ? (
                      <CheckCircle2
                        size={15}
                        className="mt-0.5 shrink-0 text-ok"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        size={15}
                        className="mt-0.5 shrink-0 text-danger"
                        aria-hidden="true"
                      />
                    )}
                    <span className="sr-only">
                      {check.ok ? t("teamsAdmin.readiness.ok") : t("teamsAdmin.readiness.fail")}
                    </span>
                    <span>
                      <span className="text-foreground">{t(readinessKeys[check.key])}</span>
                      {check.detail ? (
                        <span className="block break-all text-[11.5px] text-muted-foreground">
                          {check.detail}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
                <li className="pt-1">
                  <Badge tone={readiness.ready ? "success" : "warning"}>
                    {readiness.ready
                      ? t("teamsAdmin.readiness.ready")
                      : t("teamsAdmin.readiness.notReady")}
                  </Badge>
                </li>
              </ul>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title={t("teamsAdmin.package.title")}
            subtitle={t("teamsAdmin.package.subtitle")}
          />
          <div className="flex flex-wrap gap-2 px-4 py-3.5">
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => void runPackage("bs")}
            >
              <Download /> {t("teamsAdmin.package.downloadBs")}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => void runPackage("en")}
            >
              <Download /> {t("teamsAdmin.package.downloadEn")}
            </Button>
          </div>
        </Card>
        {errorKey ? (
          <ApiErrorText messageKey={errorKey.key} requestId={errorKey.requestId} />
        ) : null}
      </div>
    </div>
  );
}
