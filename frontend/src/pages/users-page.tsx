import { Fragment, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UserRolesSection } from "@/components/users/user-roles-section";
import { PolicyPacksPanel } from "@/components/policy-packs/policy-packs-panel";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  controlCompactClassName,
  tableHeadClassName,
  tableRowClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useDirectory } from "@/lib/directory/use-directory";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import { listServices, type ServiceResponse } from "@/services/service-catalog-api";

interface UsersPageProperties {
  readonly embedded?: boolean;
}

export function UsersPage({ embedded = false }: UsersPageProperties) {
  const { t } = useTranslation();
  const directory = useDirectory();
  const [search, setSearch] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const originUnits = flattenOriginUnitOptions(directory.tree);

  useEffect(() => {
    void listServices()
      .then(setServices)
      .catch(() => setServices([]));
  }, []);

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
      {embedded ? null : (
        <PageHeader
          crumbs={["EP-HelpDesk", t("navigation.users")]}
          title={t("navigation.users")}
          subtitle={t("directory.usersIntro")}
        />
      )}
      <PolicyPacksPanel />
      <Card>
        <CardHeader
          title={t("directory.usersHeading")}
          subtitle={t("directory.usersCount", { count: directory.users.length })}
          actions={
            <input
              className={`${controlCompactClassName} w-48`}
              type="search"
              value={search}
              placeholder={t("directory.searchPlaceholder")}
              aria-label={t("directory.searchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          }
        />
        {directory.isLoading ? (
          <div className="px-4 py-3.5">
            <PanelSkeleton className="mt-0" label={t("directory.usersHeading")} />
          </div>
        ) : directory.errorKey ? (
          <div className="px-4 py-3.5">
            <ApiErrorText
              messageKey={directory.errorKey}
              requestId={directory.requestId}
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-3.5">
            <EmptyState
              icon={<Users size={18} strokeWidth={1.8} />}
              title={t("directory.usersEmptyTitle")}
              body={t("directory.usersEmptyBody")}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr
                  className={`border-b border-border/70 text-left ${tableHeadClassName}`}
                >
                  <th className="px-4 py-2.5">{t("directory.columnUser")}</th>
                  <th className="px-4 py-2.5">{t("directory.columnUnit")}</th>
                  <th className="px-4 py-2.5">{t("users.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {visible.map((user) => {
                  const expanded = expandedUserId === user.id;
                  return (
                    <Fragment key={user.id}>
                      <tr className={tableRowClassName}>
                        <td className="px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={user.displayName} size="sm" />
                            <div>
                              <p className="text-[12.5px] font-medium text-foreground">
                                {user.displayName}
                              </p>
                              <p className="text-[11px] text-muted-foreground/70">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 text-[12px] text-muted-foreground">
                          {user.organizationalUnitPath}
                        </td>
                        <td className="px-4">
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              setExpandedUserId(expanded ? null : user.id)
                            }
                          >
                            {expanded ? t("users.hideRoles") : t("users.manageRoles")}
                          </Button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={3} className="p-0">
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
        )}
      </Card>
    </section>
  );
}
