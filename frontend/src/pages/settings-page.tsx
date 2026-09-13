import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmailChannelPanel } from "@/components/settings/email-channel-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function SettingsPage() {
  const { t } = useTranslation();
  const { session, isLoading, hasPermission, hasRole } = useSessionCapabilities();
  const canOpen =
    session?.isSuperAdmin === true ||
    hasRole(roleKeys.admin) ||
    hasRole(roleKeys.superAdmin);
  const canWrite =
    session?.isSuperAdmin === true || hasPermission(permissionKeys.settingsWrite);

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.settings")]}
        title={t("navigation.settings")}
        subtitle={t("settings.intro")}
      />
      {isLoading ? <PanelSkeleton label={t("settings.email.loading")} /> : null}
      {!isLoading && !canOpen ? (
        <EmptyState
          icon={<Settings size={18} strokeWidth={1.8} />}
          title={t("settings.forbiddenTitle")}
          body={t("settings.forbiddenBody")}
        />
      ) : null}
      {!isLoading && canOpen ? <EmailChannelPanel canWrite={canWrite} /> : null}
    </section>
  );
}
