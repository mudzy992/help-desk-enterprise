import { Settings } from "lucide-react";
import { BrandingSettingsCard } from "@/components/settings/branding-settings-card";
import { useTranslation } from "react-i18next";
import { AddonsSettingsPanel } from "@/components/settings/addons-settings-panel";
import { AuthProviderSettingsCard } from "@/components/settings/auth-provider-settings-card";
import { SecurityComplianceSettingsCard } from "@/components/settings/security-compliance-settings-card";
import { SettingsRegistryPanel } from "@/components/settings/settings-registry-panel";
import { SmtpEmailSettingsCard } from "@/components/settings/smtp-email-settings-card";
import { EmailTemplatesCard } from "@/components/settings/email-templates-card";
import { InboundEmailCard } from "@/components/settings/inbound-email-card";
import { AdminSecurityPointerCard } from "@/components/settings/admin-security-pointer-card";
import { SystemSettingsCard } from "@/components/settings/system-settings-card";
import { UnroutedQueueSettingsCard } from "@/components/settings/unrouted-queue-settings-card";
import { AdminModuleReadOnlyBanner } from "@/components/admin/admin-module-read-only-banner";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { canOpenAdminSecurityTab } from "@/lib/admin/admin-security-tab";
import {
  adminReadOnlyModuleKeys,
  useAdminModuleReadOnly,
} from "@/lib/settings/use-admin-module-read-only";
import { useSettingsRegistry } from "@/lib/settings/use-settings-registry";
import { canWriteSettings } from "@/lib/session/admin-access";
import { canOpenAdminArea } from "@/lib/session/route-access";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function SettingsPage() {
  const { t } = useTranslation();
  const capabilities = useSessionCapabilities();
  const { session, isLoading } = capabilities;
  const registry = useSettingsRegistry();
  const readOnly = useAdminModuleReadOnly(adminReadOnlyModuleKeys.settings);
  const canOpen = canOpenAdminArea(capabilities);
  const canWrite = canWriteSettings(capabilities) && readOnly.canWrite;
  const canOpenSecurityTab = canOpenAdminSecurityTab(session);

  return (
    <div className="space-y-4">
      <AdminModuleReadOnlyBanner visible={canOpen && readOnly.isLocked} />
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
      {!isLoading && canOpen && registry.errorKey !== null ? (
        <div className="space-y-2">
          <ApiErrorText messageKey={registry.errorKey} requestId={registry.requestId} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={registry.isRefreshing}
            onClick={() => void registry.reload()}
          >
            {t("ui.retry")}
          </Button>
        </div>
      ) : null}
      {!isLoading && canOpen && registry.entries.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <BrandingSettingsCard
                entries={registry.entries}
                canWrite={canWrite}
                pendingKeys={registry.pendingKeys}
                onSaveMany={registry.saveMany}
              />
              <AuthProviderSettingsCard
                entries={registry.entries}
                canWrite={canWrite}
                pendingKeys={registry.pendingKeys}
                onSave={registry.save}
              />
              <SmtpEmailSettingsCard
                entries={registry.entries}
                canWrite={canWrite}
                pendingKeys={registry.pendingKeys}
                onSave={registry.save}
              />
              <EmailTemplatesCard canWrite={canWrite} />
              <InboundEmailCard />
              <SystemSettingsCard entries={registry.entries} />
            </div>
            <div className="space-y-4">
              <AddonsSettingsPanel
                canWrite={canWrite}
                pendingKeys={registry.pendingKeys}
                onSave={registry.save}
              />
              <UnroutedQueueSettingsCard
                entries={registry.entries}
                canWrite={canWrite}
                pendingKeys={registry.pendingKeys}
                onSave={registry.save}
              />
              <SecurityComplianceSettingsCard
                entries={registry.entries}
                canWrite={canWrite}
                pendingKeys={registry.pendingKeys}
                onSave={registry.save}
              />
              {/* Keep one canonical security editor; Settings links to its Admin tab. */}
              {canOpenSecurityTab ? <AdminSecurityPointerCard /> : null}
            </div>
          </div>
          <SettingsRegistryPanel
            entries={registry.entries}
            canWrite={canWrite}
            pendingKeys={registry.pendingKeys}
            errorKey={registry.errorKey}
            onSave={registry.save}
          />
        </>
      ) : null}
    </div>
  );
}
