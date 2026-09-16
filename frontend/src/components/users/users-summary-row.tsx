import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UserAdminActions } from "@/components/users/user-admin-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CreateUserResponse, UserSummary } from "@/services/users-api";

const ROLE_STYLE: Record<UserSummary["roleTone"], string> = {
  super: "border-danger/35 bg-danger/10 text-danger",
  manager: "border-primary/35 bg-primary/12 text-[#7FA8F5]",
  agent: "border-info/30 bg-info/10 text-info",
  user: "border-border bg-elevated text-muted-foreground",
};

interface UsersSummaryRowProperties {
  readonly user: UserSummary;
  readonly expanded: boolean;
  readonly canManageUsers: boolean;
  readonly isSelf: boolean;
  readonly onToggleRoles: () => void;
  readonly onChanged: () => Promise<void>;
  readonly onPasswordIssued: (result: CreateUserResponse) => void;
}

export function UsersSummaryRow({
  user,
  expanded,
  canManageUsers,
  isSelf,
  onToggleRoles,
  onChanged,
  onPasswordIssued,
}: UsersSummaryRowProperties) {
  const { t } = useTranslation();
  const permissionScope =
    user.roleTone === "super"
      ? t("users.scopeSystem")
      : user.roleTone === "agent"
        ? t("users.scopeOu", { name: user.organizationalUnitName ?? "—" })
        : t("users.scopeOwn");

  return (
    <tr className="transition-colors hover:bg-elevated/40">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={user.displayName} size="sm" />
          <div>
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
              {user.displayName}
              {!user.isActive ? (
                <Badge tone="neutral" dot={false}>
                  {t("users.inactive")}
                </Badge>
              ) : null}
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
            "inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
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
              "tnum text-[12px] font-medium",
              user.openTicketCount > 9 ? "text-warning" : "text-foreground/90",
            )}
          >
            {t("users.openLoad", { count: user.openTicketCount })}
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
        <button
          type="button"
          className="mt-1 block w-full text-right text-[11px] text-[#7FA8F5]"
          onClick={onToggleRoles}
        >
          {expanded ? t("users.hideRoles") : t("users.manageRoles")}
        </button>
        <div className="mt-2">
          <UserAdminActions
            userId={user.id}
            userDisplayName={user.displayName}
            canManage={canManageUsers}
            isSelf={isSelf}
            onChanged={onChanged}
            onPasswordIssued={onPasswordIssued}
          />
        </div>
      </td>
    </tr>
  );
}
