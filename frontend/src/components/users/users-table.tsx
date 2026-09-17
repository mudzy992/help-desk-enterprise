import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { UserRolesSection } from "@/components/users/user-roles-section";
import { UsersSummaryRow } from "@/components/users/users-summary-row";
import { tableHeadClassName } from "@/components/ui/control";
import type { ServiceResponse } from "@/services/service-catalog-api";
import type {
  CreateUserResponse,
  UserSummary,
} from "@/services/users-api";

interface UsersTableProperties {
  readonly visible: readonly UserSummary[];
  readonly expandedUserId: string | null;
  readonly setExpandedUserId: (value: string | null) => void;
  readonly canManageUsers: boolean;
  readonly canLinkDirectory: boolean;
  readonly currentUserId: string | null;
  readonly originUnits: readonly { id: string; label: string }[];
  readonly services: readonly ServiceResponse[];
  readonly onReload: () => Promise<void>;
  readonly onPasswordIssued: (result: CreateUserResponse) => void;
}

export function UsersTable({
  visible,
  expandedUserId,
  setExpandedUserId,
  canManageUsers,
  canLinkDirectory,
  currentUserId,
  originUnits,
  services,
  onReload,
  onPasswordIssued,
}: UsersTableProperties) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
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
          {visible.map((user) => {
            const expanded = expandedUserId === user.id;
            return (
              <Fragment key={user.id}>
                <UsersSummaryRow
                  user={user}
                  expanded={expanded}
                  canManageUsers={canManageUsers}
                  canLinkDirectory={canLinkDirectory}
                  isSelf={currentUserId === user.id}
                  onToggleRoles={() =>
                    setExpandedUserId(expanded ? null : user.id)
                  }
                  onChanged={onReload}
                  onPasswordIssued={onPasswordIssued}
                />
                {expanded ? (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <UserRolesSection
                        userId={user.id}
                        originUnits={originUnits}
                        services={services}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
