import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { AdminSecurityAuditCard } from "@/components/admin/admin-security-audit-card";
import { canOpenAdminSecurityTab } from "@/lib/admin/admin-security-tab";

/**
 * Paket 5.4.0-d (M6): the „Sigurnost" admin view. It is a SuperAdmin surface:
 * the tab is only offered to a SuperAdmin, and a deep link by an ordinary ADMIN
 * renders the safe forbidden state — the card never issues a request for them.
 * The bulk password reset lives here as well, so every wave-d security action
 * has exactly one home.
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
    </div>
  );
}
