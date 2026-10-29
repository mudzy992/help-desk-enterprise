import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminModuleReadOnlyBanner } from "@/components/admin/admin-module-read-only-banner";
import { ConfigVersionsWorkspace } from "@/components/config-versions/config-versions-workspace";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, brandCrumb } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  canImportConfigPackage,
  canOpenConfigVersions,
  canWriteConfigVersions,
} from "@/lib/config-versions/can-access-config-versions";
import {
  adminReadOnlyModuleKeys,
  useAdminModuleReadOnly,
} from "@/lib/settings/use-admin-module-read-only";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function ConfigVersionsPage() {
  const { t } = useTranslation();
  const { session, isLoading } = useSessionCapabilities();
  const readOnly = useAdminModuleReadOnly(adminReadOnlyModuleKeys.settings);
  const canOpen =
    session !== null &&
    canOpenConfigVersions({
      isSuperAdmin: session.isSuperAdmin,
      roleKeys: session.roleKeys,
    });
  const canWrite =
    readOnly.canWrite &&
    session !== null &&
    canWriteConfigVersions({
      isSuperAdmin: session.isSuperAdmin,
      permissionKeys: session.permissionKeys,
    });

  const canImport =
    readOnly.canWrite &&
    session !== null &&
    canImportConfigPackage({
      isSuperAdmin: session.isSuperAdmin,
      permissionKeys: session.permissionKeys,
    });

  return (
    <section>
      <PageHeader
        crumbs={[brandCrumb, t("navigation.configVersions")]}
        title={t("configVersions.title")}
        subtitle={t("configVersions.intro")}
      />
      <AdminModuleReadOnlyBanner visible={canOpen && readOnly.isLocked} />
      {canOpen && readOnly.errorKey !== null ? (
        <div className="mb-4 space-y-2">
          <ApiErrorText messageKey={readOnly.errorKey} requestId={readOnly.requestId} />
          <Button type="button" size="sm" variant="outline" onClick={() => void readOnly.retry()}>
            {t("ui.retry")}
          </Button>
        </div>
      ) : null}
      {isLoading ? <PanelSkeleton label={t("configVersions.loading")} /> : null}
      {!isLoading && !canOpen ? (
        <EmptyState
          icon={<History size={18} strokeWidth={1.8} />}
          title={t("configVersions.forbiddenTitle")}
          body={t("configVersions.forbiddenBody")}
        />
      ) : null}
      {!isLoading && canOpen ? (
        <ConfigVersionsWorkspace canWrite={canWrite} canImport={canImport} />
      ) : null}
    </section>
  );
}
