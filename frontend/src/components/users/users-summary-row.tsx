import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserSummary } from "@/services/users-api";

const ROLE_STYLE: Record<UserSummary["roleTone"], string> = {
  super: "border-danger/35 bg-danger/10 text-danger",
  manager: "border-primary/35 bg-primary/15 text-link",
  agent: "border-info/30 bg-info/10 text-info",
  user: "border-border bg-elevated text-muted-foreground",
};

interface UsersSummaryRowProperties {
  readonly user: UserSummary;
  readonly canManageUsers: boolean;
  readonly onEdit: () => void;
}

export function UsersSummaryRow({
  user,
  canManageUsers,
  onEdit,
}: UsersSummaryRowProperties) {
  const { t } = useTranslation();
  const permissionScope =
    user.roleTone === "super"
      ? t("users.scopeSystem")
      : user.roleTone === "agent"
        ? t("users.scopeOu", { name: user.organizationalUnitName ?? "—" })
        : t("users.scopeOwn");

  return (
    <tr className="transition-colors hover:bg-surface-hover">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={user.displayName} size="sm" />
          <div>
            <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-foreground">
              {user.displayName}
              {!user.isActive ? (
                <Badge tone="neutral" dot={false}>
                  {t("users.inactive")}
                </Badge>
              ) : null}
              <Badge tone={user.isLocalOnly ? "neutral" : "accent"} dot={false}>
                {user.isLocalOnly
                  ? t("users.badgeLocal")
                  : t("users.badgeDirectoryLinked")}
              </Badge>
              {user.roleTone === "super" ? (
                <ShieldCheck size={12} className="text-danger" />
              ) : null}
            </p>
            <p className="text-[11px] text-muted-foreground/70">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span
          className={cn(
            "inline-flex rounded-lg border px-1.5 py-0.5 text-[11px] font-medium",
            ROLE_STYLE[user.roleTone],
          )}
        >
          {user.roleName ?? user.roleKey ?? "—"}
        </span>
      </td>
      <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
        {user.organizationalUnitName ?? "—"}
        {user.groupName ? (
          <span className="block text-[10.5px] text-muted-foreground/60">
            {user.groupName}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-2.5">
        {user.policyPackKey ? (
          <Badge tone="accent" dot={false}>
            {t(`policyPacks.packs.${user.policyPackKey}.name`, {
              defaultValue: user.policyPackKey,
            })}
          </Badge>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
        {permissionScope}
      </td>
      <td className="px-4 py-2.5 text-center">
        <span className="text-muted-foreground/50">—</span>
      </td>
      <td className="px-4 py-2.5 text-right">
        {user.openTicketCount > 0 ? (
          <span
            className={cn(
              "tnum block text-[12px] font-medium",
              user.openTicketCount > 9 ? "text-warning" : "text-foreground/90",
            )}
          >
            {t("users.openLoad", { count: user.openTicketCount })}
          </span>
        ) : (
          <span className="block text-muted-foreground/50">—</span>
        )}
        {canManageUsers ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-1"
            onClick={onEdit}
          >
            {t("users.editUser")}
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
