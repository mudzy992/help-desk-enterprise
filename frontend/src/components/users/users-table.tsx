import { useTranslation } from "react-i18next";
import { UsersSummaryRow } from "@/components/users/users-summary-row";
import { tableHeadClassName } from "@/components/ui/control";
import type { UserSummary } from "@/services/users-api";

interface UsersTableProperties {
  readonly visible: readonly UserSummary[];
  readonly canManageUsers: boolean;
  readonly onEditUser: (userId: string) => void;
}

export function UsersTable({
  visible,
  canManageUsers,
  onEditUser,
}: UsersTableProperties) {
  const { t } = useTranslation();
  return (
    <div className="fade-in overflow-x-auto">
      <table className="w-full min-w-[860px] text-left">
        <thead>
          <tr
            className={`border-b border-border/70 text-left ${tableHeadClassName}`}
          >
            <th className="px-4 py-2.5">{t("users.columnUser")}</th>
            <th className="px-4 py-2.5">{t("users.columnRole")}</th>
            <th className="px-4 py-2.5">{t("users.columnOuGroup")}</th>
            <th className="px-4 py-2.5">{t("users.columnPolicyPack")}</th>
            <th className="px-4 py-2.5">{t("users.columnScope")}</th>
            <th className="px-4 py-2.5 text-center">{t("users.columnMfa")}</th>
            <th className="px-4 py-2.5 text-right">{t("users.columnLoad")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {visible.map((user) => (
            <UsersSummaryRow
              key={user.id}
              user={user}
              canManageUsers={canManageUsers}
              onEdit={() => onEditUser(user.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
