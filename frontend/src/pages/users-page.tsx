import { Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import {
  controlClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useDirectory } from "@/lib/directory/use-directory";

export function UsersPage() {
  const { t } = useTranslation();
  const directory = useDirectory();
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const visible =
    term.length === 0
      ? directory.users
      : directory.users.filter(
          (user) =>
            user.displayName.toLowerCase().includes(term) ||
            user.email.toLowerCase().includes(term) ||
            user.organizationalUnitPath.toLowerCase().includes(term),
        );

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.users")]}
        title={t("navigation.users")}
        subtitle={t("directory.usersIntro")}
      />
      <Card>
        <CardHeader
          title={t("directory.usersHeading")}
          subtitle={t("directory.usersCount", { count: directory.users.length })}
          actions={
            <input
              className={`${controlClassName} w-56`}
              type="search"
              value={search}
              placeholder={t("directory.searchPlaceholder")}
              aria-label={t("directory.searchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          }
        />
        <div className="px-4 py-3.5">
          {directory.isLoading ? (
            <PanelSkeleton className="mt-0" label={t("directory.usersHeading")} />
          ) : directory.errorKey ? (
            <ApiErrorText
              messageKey={directory.errorKey}
              requestId={directory.requestId}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Users size={18} strokeWidth={1.8} />}
              title={t("directory.usersEmptyTitle")}
              body={t("directory.usersEmptyBody")}
            />
          ) : (
            <div className={tableWrapClassName}>
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
                  <tr>
                    <th className="px-3 py-2">{t("directory.columnName")}</th>
                    <th className="px-3 py-2">{t("directory.columnEmail")}</th>
                    <th className="px-3 py-2">{t("directory.columnUnit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((user) => (
                    <tr key={user.id} className={tableRowClassName}>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2 font-medium text-foreground">
                          <Avatar name={user.displayName} size="sm" />
                          {user.displayName}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground">
                        {user.organizationalUnitPath}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
