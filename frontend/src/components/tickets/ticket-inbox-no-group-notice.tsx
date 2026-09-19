import { Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { buildAdminGroupsPath } from "@/lib/admin/parse-admin-tab";

interface TicketInboxNoGroupNoticeProperties {
  readonly canManageGroups: boolean;
}

export function TicketInboxNoGroupNotice({
  canManageGroups,
}: TicketInboxNoGroupNoticeProperties) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="mb-3 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3"
    >
      <Users
        size={16}
        className="mt-0.5 shrink-0 text-warning"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-foreground">
          {t("tickets.inboxNoGroupTitle")}
        </p>
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
          {canManageGroups
            ? t("tickets.inboxNoGroupAdminBody")
            : t("tickets.inboxNoGroupBody")}
        </p>
      </div>
      {canManageGroups ? (
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to={buildAdminGroupsPath()}>{t("tickets.inboxOpenGroups")}</Link>
        </Button>
      ) : null}
    </div>
  );
}
