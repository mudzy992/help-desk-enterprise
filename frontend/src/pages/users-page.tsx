import { Fragment, useCallback, useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AddUserForm } from "@/components/users/add-user-form";
import { UserRolesSection } from "@/components/users/user-roles-section";
import { UsersSummaryRow } from "@/components/users/users-summary-row";
import { PolicyPacksPanel } from "@/components/policy-packs/policy-packs-panel";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  controlCompactClassName,
  tableHeadClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import { listServices, type ServiceResponse } from "@/services/service-catalog-api";
import { listUsersSummary, type UserSummary } from "@/services/users-api";

interface UsersPageProperties {
  readonly embedded?: boolean;
}

export function UsersPage({ embedded = false }: UsersPageProperties) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<readonly UserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [originUnits, setOriginUnits] = useState<
    readonly { id: string; label: string }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      const [loadedUsers, tree, loadedServices] = await Promise.all([
        listUsersSummary(),
        listOrganizationalUnitTree(),
        listServices().catch(() => []),
      ]);
      setUsers(loadedUsers);
      setOriginUnits(flattenOriginUnitOptions(tree));
      setServices(loadedServices);
    } catch (error) {
      setUsers([]);
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const term = search.trim().toLowerCase();
  const visible =
    term.length === 0
      ? users
      : users.filter(
          (user) =>
            user.displayName.toLowerCase().includes(term) ||
            user.email.toLowerCase().includes(term) ||
            (user.roleName ?? "").toLowerCase().includes(term),
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
          subtitle={t("directory.usersCount", { count: users.length })}
          actions={
            <div className="flex items-center gap-2">
              <input
                className={`${controlCompactClassName} w-48`}
                type="search"
                value={search}
                placeholder={t("directory.searchPlaceholder")}
                aria-label={t("directory.searchPlaceholder")}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
                <Plus size={14} /> {t("users.addUser")}
              </Button>
            </div>
          }
        />
        {showAddForm ? (
          <AddUserForm
            unitOptions={originUnits}
            onCancel={() => setShowAddForm(false)}
            onCreated={async () => {
              setShowAddForm(false);
              await reload();
            }}
          />
        ) : null}
        {isLoading ? (
          <div className="px-4 py-3.5">
            <PanelSkeleton className="mt-0" label={t("directory.usersHeading")} />
          </div>
        ) : errorKey ? (
          <div className="px-4 py-3.5">
            <ApiErrorText messageKey={errorKey} requestId={requestId} />
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
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className={`border-b border-border/70 text-left ${tableHeadClassName}`}>
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
                        onToggleRoles={() =>
                          setExpandedUserId(expanded ? null : user.id)
                        }
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
        )}
      </Card>
    </section>
  );
}
