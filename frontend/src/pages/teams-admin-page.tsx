import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TeamsStatusTab } from "@/components/teams/teams-status-tab";
import { TeamsChannelsTab } from "@/components/teams/teams-channels-tab";
import { TeamsSimulatorTab } from "@/components/teams/teams-simulator-tab";
import { PageHeader } from "@/components/layout/page-header";
import { UnderlineTabs } from "@/components/ui/tabs";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { describeTeamsError, type TeamsErrorDetails } from "@/lib/teams/map-teams-error";
import { getTeamsStatus, type TeamsStatus } from "@/services/teams-api";

type TeamsTab = "status" | "channels" | "simulator";

export function TeamsAdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TeamsTab>("status");
  const [status, setStatus] = useState<TeamsStatus | null>(null);
  const [errorKey, setErrorKey] = useState<TeamsErrorDetails | null>(null);

  const loadStatus = useCallback(() => {
    void getTeamsStatus()
      .then((next) => {
        setStatus(next);
        setErrorKey(null);
      })
      .catch((error: unknown) => setErrorKey(describeTeamsError(error)));
  }, []);

  useEffect(loadStatus, [loadStatus]);
  useEffect(() => {
    if (status !== null && !status.simulatorAvailable && tab === "simulator") setTab("status");
  }, [status, tab]);

  const tabs = [
    { key: "status", label: t("teamsAdmin.tabs.status") },
    { key: "channels", label: t("teamsAdmin.tabs.channels") },
    ...(status?.simulatorAvailable
      ? [{ key: "simulator", label: t("teamsAdmin.tabs.simulator") }]
      : []),
  ];

  return (
    <section>
      <PageHeader
        crumbs={[t("navigation.admin"), t("teamsAdmin.title")]}
        title={t("teamsAdmin.title")}
        subtitle={t("teamsAdmin.subtitle")}
      />
      <UnderlineTabs
        className="mb-4"
        active={tab}
        onChange={(key) => setTab(key as TeamsTab)}
        items={tabs}
      />
      {errorKey ? <ApiErrorText messageKey={errorKey.key} requestId={errorKey.requestId} /> : null}
      {status === null && errorKey === null ? <PanelSkeleton label={t("session.loading")} /> : null}
      {status !== null && tab === "status" ? (
        <TeamsStatusTab status={status} onRefresh={loadStatus} />
      ) : null}
      {status !== null && tab === "channels" ? <TeamsChannelsTab /> : null}
      {status?.simulatorAvailable && tab === "simulator" ? <TeamsSimulatorTab /> : null}
    </section>
  );
}
