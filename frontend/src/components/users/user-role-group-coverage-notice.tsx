import { Trans } from "react-i18next";
import { Link } from "react-router-dom";
import { buildAdminGroupsPath } from "@/lib/admin/parse-admin-tab";
import type { UserRoleGroupCoverageGap } from "@/lib/users/user-role-group-coverage";

interface UserRoleGroupCoverageNoticeProperties {
  readonly gap: UserRoleGroupCoverageGap;
}

export function UserRoleGroupCoverageNotice({
  gap,
}: UserRoleGroupCoverageNoticeProperties) {
  const groupsPath = buildAdminGroupsPath(gap.organizationalUnitId);
  return (
    <p
      role="status"
      className="mt-1 text-[11px] text-sky-800 dark:text-sky-300"
    >
      <Trans
        i18nKey="users.roleGroupCoverageWarning"
        values={{ unitName: gap.organizationalUnitLabel }}
        components={{
          groupsLink: (
            <Link
              to={groupsPath}
              className="font-medium underline underline-offset-2"
            />
          ),
        }}
      />
    </p>
  );
}
