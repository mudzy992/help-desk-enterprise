import { useCallback, useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AddUserForm } from "@/components/users/add-user-form";
import { TemporaryPasswordReveal } from "@/components/users/temporary-password-reveal";
import { UsersTable } from "@/components/users/users-table";
import { PolicyPacksPanel } from "@/components/policy-packs/policy-packs-panel";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { controlCompactClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  mapApiError,
  readApiRequestId,
  type ApiErrorKey,
} from "@/lib/map-api-error";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import {
  listServices,
  type ServiceResponse,
} from "@/services/service-catalog-api";
import {
  listUsersSummary,
  type CreateUserResponse,
  type UserSummary,
} from "@/services/users-api";

interface UsersPageProperties {
  readonly embedded?: boolean;
}

export function UsersPage({ embedded = false }: UsersPageProperties) {
  const { t } = useTranslation();
  const { currentUserId } = useSession();
  const capabilities = useSessionCapabilities();
  const roleKeys = capabilities.session?.roleKeys ?? [];
  const canManageUsers =
    capabilities.session?.isSuperAdmin === true ||
    roleKeys.includes("ADMIN") ||
    roleKeys.includes("SUPER_ADMIN");
  const [users, setUsers] = useState<readonly UserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [passwordReveal, setPasswordReveal] =
    useState<CreateUserResponse | null>(null);
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
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowAddForm(true)}
              >
                <Plus size={14} /> {t("users.addUser")}
              </Button>
            </div>
          }
        />
        {passwordReveal !== null ? (
          <TemporaryPasswordReveal
            result={passwordReveal}
            onClose={() => setPasswordReveal(null)}
          />
        ) : null}
        {showAddForm ? (
          <AddUserForm
            unitOptions={originUnits}
            onCancel={() => setShowAddForm(false)}
            onCreated={async () => {
              await reload();
            }}
          />
        ) : null}
        {isLoading ? (
          <div className="px-4 py-3.5">
            <PanelSkeleton
              className="mt-0"
              label={t("directory.usersHeading")}
            />
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
          <UsersTable
            visible={visible}
            expandedUserId={expandedUserId}
            setExpandedUserId={setExpandedUserId}
            canManageUsers={canManageUsers}
            currentUserId={currentUserId}
            originUnits={originUnits}
            services={services}
            onReload={reload}
            onPasswordIssued={setPasswordReveal}
          />
        )}
      </Card>
    </section>
  );
}
