import { Database, FolderTree, Server, Users } from "lucide-react";
import { useCallback, useEffect } from "react";
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
import { UsersPage } from "@/pages/users-page";
import { PageHeader } from "@/components/ui/page-header";
import { UnderlineTabs } from "@/components/ui/tabs";

export function AdminPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseAdminTab(searchParams.get("tab"));

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
            key: "users",
            label: (
              <span className="flex items-center gap-1.5">
                <Users size={13} /> {t("admin.tabs.users")}
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
      {tab === "org" ? <OrganizationalUnitsPage embedded /> : null}
      {tab === "users" ? <UsersPage embedded /> : null}
      {tab === "settings" ? <SettingsPage embedded /> : null}
      {tab === "ops" ? <AdminOpsPlaceholder /> : null}
    </section>
  );
}
