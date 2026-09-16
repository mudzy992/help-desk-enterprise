import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AddonsSettingsPanel } from "@/components/settings/addons-settings-panel";
import { EmailChannelPanel } from "@/components/settings/email-channel-panel";
import { SettingsRegistryPanel } from "@/components/settings/settings-registry-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

interface SettingsPageProperties {
  readonly embedded?: boolean;
}

export function SettingsPage({ embedded = false }: SettingsPageProperties) {
  const { t } = useTranslation();
  const { session, isLoading, hasPermission, hasRole } = useSessionCapabilities();
  const canOpen =
    session?.isSuperAdmin === true ||
    hasRole(roleKeys.admin) ||
    hasRole(roleKeys.superAdmin);
  const canWrite =
    session?.isSuperAdmin === true || hasPermission(permissionKeys.settingsWrite);

  return (
    <div className="space-y-4">
      {embedded ? null : (
        <PageHeader
          crumbs={["EP-HelpDesk", t("navigation.settings")]}
          title={t("navigation.settings")}
          subtitle={t("settings.intro")}
        />
      )}
      {isLoading ? <PanelSkeleton label={t("settings.email.loading")} /> : null}
      {!isLoading && !canOpen ? (
        <EmptyState
          icon={<Settings size={18} strokeWidth={1.8} />}
          title={t("settings.forbiddenTitle")}
          body={t("settings.forbiddenBody")}
        />
      ) : null}
      {!isLoading && canOpen ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <EmailChannelPanel canWrite={canWrite} />
            <AddonsSettingsPanel />
          </div>
          <SettingsRegistryPanel canWrite={canWrite} />
        </>
      ) : null}
    </div>
  );
}
