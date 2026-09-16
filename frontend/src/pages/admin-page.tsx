import { Database, FolderTree, Server, Settings2, ShieldCheck, Users, UsersRound } from "lucide-react";
import { type ReactNode, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  defaultAdminTab,
  isAdminTab,
  parseAdminTab,
} from "@/lib/admin/parse-admin-tab";
import { AdminOpsPlaceholder } from "@/components/admin/admin-ops-placeholder";
import { OrganizationalUnitsPage } from "@/pages/organizational-units-page";
import { SettingsPage } from "@/pages/settings-page";
import { GroupsPage } from "@/pages/groups-page";
import { PermissionsPage } from "@/pages/permissions-page";
import { UsersPage } from "@/pages/users-page";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { roleKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function AdminPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, isLoading, hasRole } = useSessionCapabilities();
  const tab = parseAdminTab(searchParams.get("tab"));
  const canOpenAdmin =
    session?.isSuperAdmin === true ||
    hasRole(roleKeys.admin) ||
    hasRole(roleKeys.superAdmin);

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw === null || isAdminTab(raw)) {
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.set("tab", defaultAdminTab);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const setTab = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("tab", parseAdminTab(key));
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const renderRestrictedTab = (content: ReactNode) => {
    if (isLoading) {
      return <PanelSkeleton label={t("session.loading")} />;
    }
    if (!canOpenAdmin) {
      return (
        <EmptyState
          icon={<Settings2 size={18} strokeWidth={1.8} />}
          title={t("admin.forbiddenTitle")}
          body={t("admin.forbiddenBody")}
        />
      );
    }
    return content;
  };

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.admin")]}
        title={t("admin.title")}
        subtitle={t("admin.subtitle")}
      />
      <UnderlineTabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        items={[
          {
            key: "org",
            label: (
              <span className="flex items-center gap-1.5">
                <FolderTree size={13} /> {t("admin.tabs.org")}
              </span>
            ),
          },
          {
            key: "groups",
            label: (
              <span className="flex items-center gap-1.5">
                <UsersRound size={13} /> {t("admin.tabs.groups")}
              </span>
            ),
          },
          {
            key: "users",
            label: (
              <span className="flex items-center gap-1.5">
                <Users size={13} /> {t("admin.tabs.users")}
              </span>
            ),
          },
          {
            key: "permissions",
            label: (
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={13} /> {t("admin.tabs.permissions")}
              </span>
            ),
          },
          {
            key: "settings",
            label: (
              <span className="flex items-center gap-1.5">
                <Server size={13} /> {t("admin.tabs.settings")}
              </span>
            ),
          },
          {
            key: "ops",
            label: (
              <span className="flex items-center gap-1.5">
                <Database size={13} /> {t("admin.tabs.ops")}
              </span>
            ),
          },
        ]}
      />
      {tab === "org"
        ? renderRestrictedTab(<OrganizationalUnitsPage embedded />)
        : null}
      {tab === "groups" ? renderRestrictedTab(<GroupsPage embedded />) : null}
      {tab === "users" ? renderRestrictedTab(<UsersPage embedded />) : null}
      {tab === "permissions" ? renderRestrictedTab(<PermissionsPage embedded />) : null}
      {tab === "settings" ? <SettingsPage embedded /> : null}
      {tab === "ops" ? renderRestrictedTab(<AdminOpsPlaceholder />) : null}
    </section>
  );
}
