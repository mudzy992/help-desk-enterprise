import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfigVersionsWorkspace } from "@/components/config-versions/config-versions-workspace";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, brandCrumb } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  canImportConfigPackage,
  canOpenConfigVersions,
  canWriteConfigVersions,
} from "@/lib/config-versions/can-access-config-versions";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function ConfigVersionsPage() {
  const { t } = useTranslation();
  const { session, isLoading } = useSessionCapabilities();
  const canOpen =
    session !== null &&
    canOpenConfigVersions({
      isSuperAdmin: session.isSuperAdmin,
      roleKeys: session.roleKeys,
    });
  const canWrite =
    session !== null &&
    canWriteConfigVersions({
      isSuperAdmin: session.isSuperAdmin,
      permissionKeys: session.permissionKeys,
    });

  const canImport =
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
      {isLoading ? <PanelSkeleton label={t("configVersions.loading")} /> : null}
      {!isLoading && !canOpen ? (
        <EmptyState
          icon={<History size={18} strokeWidth={1.8} />}
          title={t("configVersions.forbiddenTitle")}
          body={t("configVersions.forbiddenBody")}
        />
      ) : null}
      {!isLoading && canOpen ? <ConfigVersionsWorkspace canWrite={canWrite} canImport={canImport} /> : null}
    </section>
  );
}
