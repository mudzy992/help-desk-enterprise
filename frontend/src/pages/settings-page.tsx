import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AddonsSettingsPanel } from "@/components/settings/addons-settings-panel";
import { AuthProviderSettingsCard } from "@/components/settings/auth-provider-settings-card";
import { SecurityComplianceSettingsCard } from "@/components/settings/security-compliance-settings-card";
import { SettingsRegistryPanel } from "@/components/settings/settings-registry-panel";
import { SmtpEmailSettingsCard } from "@/components/settings/smtp-email-settings-card";
import { SystemSettingsCard } from "@/components/settings/system-settings-card";
import { UnroutedQueueSettingsCard } from "@/components/settings/unrouted-queue-settings-card";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useSettingsRegistry } from "@/lib/settings/use-settings-registry";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

interface SettingsPageProperties {
  readonly embedded?: boolean;
}

export function SettingsPage({ embedded = false }: SettingsPageProperties) {
  const { t } = useTranslation();
  const { session, isLoading, hasPermission, hasRole } = useSessionCapabilities();
  const registry = useSettingsRegistry();
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
      {isLoading || (canOpen && registry.isLoading && registry.entries.length === 0) ? (
        <PanelSkeleton label={t("settings.email.loading")} />
      ) : null}
      {!isLoading && !canOpen ? (
        <EmptyState
          icon={<Settings size={18} strokeWidth={1.8} />}
          title={t("settings.forbiddenTitle")}
          body={t("settings.forbiddenBody")}
        />
      ) : null}
      {!isLoading && canOpen && registry.errorKey !== null && registry.entries.length === 0 ? (
        <ApiErrorText messageKey={registry.errorKey} />
      ) : null}
      {!isLoading && canOpen && registry.entries.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <AuthProviderSettingsCard
                entries={registry.entries}
                canWrite={canWrite}
                pendingKey={registry.pendingKey}
                onSave={registry.save}
              />
              <SmtpEmailSettingsCard
                entries={registry.entries}
                canWrite={canWrite}
                pendingKey={registry.pendingKey}
                onSave={registry.save}
              />
              <SystemSettingsCard entries={registry.entries} />
            </div>
            <div className="space-y-4">
              <AddonsSettingsPanel
                canWrite={canWrite}
                pendingKey={registry.pendingKey}
                onSave={registry.save}
              />
              <UnroutedQueueSettingsCard
                entries={registry.entries}
                canWrite={canWrite}
                pendingKey={registry.pendingKey}
                onSave={registry.save}
              />
              <SecurityComplianceSettingsCard
                entries={registry.entries}
                canWrite={canWrite}
                pendingKey={registry.pendingKey}
                onSave={registry.save}
              />
            </div>
          </div>
          <SettingsRegistryPanel
            entries={registry.entries}
            canWrite={canWrite}
            pendingKey={registry.pendingKey}
            errorKey={registry.errorKey}
            onSave={registry.save}
          />
        </>
      ) : null}
    </div>
  );
}
