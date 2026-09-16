import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PermissionsPanel } from "@/components/rbac/permissions-panel";
import { RequireAccess } from "@/components/layout/require-access";
import { PageHeader } from "@/components/ui/page-header";
import { roleKeys } from "@/lib/session/permission-keys";

interface PermissionsPageProperties {
  readonly embedded?: boolean;
}

export function PermissionsPage({ embedded = false }: PermissionsPageProperties) {
  const { t } = useTranslation();
  return (
    <section>
      {embedded ? null : (
        <PageHeader
          crumbs={["EP-HelpDesk", t("navigation.admin"), t("permissions.title")]}
          title={t("permissions.title")}
          subtitle={t("permissions.subtitle")}
        />
      )}
      <RequireAccess
        icon={<ShieldCheck size={18} strokeWidth={1.8} />}
        check={(capabilities) =>
          capabilities.session?.isSuperAdmin === true ||
          capabilities.hasRole(roleKeys.superAdmin)
        }
        forbiddenTitleKey="permissions.forbiddenTitle"
        forbiddenBodyKey="permissions.forbiddenBody"
      >
        <PermissionsPanel />
      </RequireAccess>
    </section>
  );
}
