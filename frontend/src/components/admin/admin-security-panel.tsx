import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { AdminSecurityAuditCard } from "@/components/admin/admin-security-audit-card";
import { AdminSecuritySettingsCards } from "@/components/admin/admin-security-settings-cards";
import { canOpenAdminSecurityTab } from "@/lib/admin/admin-security-tab";

/**
 * Paket 5.4.0-d (M6) + 5.4.0-e (M2/M4) + 5.4.0-e.2 (UI polish): the „Sigurnost"
 * admin view. It is a SuperAdmin surface: the tab is only offered to a
 * SuperAdmin, and a deep link by an ordinary ADMIN renders the safe forbidden
 * state — the card never issues a request for them.
 *
 * Everything a security administrator changes lives here, next to the journal
 * it is recorded in: the login rate limits, the session policy and the HIBP
 * switch (edited through dialogs, never inline), and the bulk password reset.
 * The Postavke tab keeps a pointer row so nobody has to guess where they went.
 */
export function AdminSecurityPanel({
  isLoading,
  session,
}: {
  readonly isLoading: boolean;
  readonly session: { readonly isSuperAdmin?: boolean } | null;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return <PanelSkeleton label={t("session.loading")} />;
  }

  if (!canOpenAdminSecurityTab(session)) {
    return (
      <EmptyState
        icon={<ShieldCheck size={18} strokeWidth={1.8} />}
        title={t("admin.security.forbiddenTitle")}
        body={t("admin.security.forbiddenBody")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminSecurityAuditCard canView />
      <AdminSecuritySettingsCards isSuperAdmin />
    </div>
  );
}
