import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AddUserForm } from "@/components/users/add-user-form";
import { TemporaryPasswordReveal } from "@/components/users/temporary-password-reveal";
import { UserDetailDrawer } from "@/components/users/user-detail-drawer";
import { UsersTable } from "@/components/users/users-table";
import { PolicyPacksPanel } from "@/components/policy-packs/policy-packs-panel";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { controlCompactClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, brandCrumb } from "@/components/ui/page-header";
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
  listUsersSummaryPage,
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
  const canLinkDirectory =
    capabilities.session?.isSuperAdmin === true ||
    roleKeys.includes("SUPER_ADMIN");
  const pageSize = 100;
  const [users, setUsers] = useState<readonly UserSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
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
      const page = await listUsersSummaryPage({
        take: pageSize,
        skip: pageIndex * pageSize,
        query: search,
      });
      setUsers(page.items);
      setTotalUsers(page.total);
      if (page.items.length === 0 && pageIndex > 0 && pageIndex * pageSize >= page.total) {
        setPageIndex(Math.max(0, Math.ceil(page.total / pageSize) - 1));
      }
    } catch (error) {
      setUsers([]);
      setTotalUsers(0);
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [pageIndex, pageSize, search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let active = true;
    Promise.all([listOrganizationalUnitTree(), listServices().catch(() => [])])
      .then(([tree, loadedServices]) => {
        if (!active) return;
        setOriginUnits(flattenOriginUnitOptions(tree));
        setServices(loadedServices);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorKey(mapApiError(error));
        setRequestId(readApiRequestId(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = users;
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const firstVisible = totalUsers === 0 ? 0 : pageIndex * pageSize + 1;
  const lastVisible = Math.min(totalUsers, pageIndex * pageSize + users.length);
  const selectedUser =
    users.find((user) => user.id === selectedUserId) ?? null;

  return (
    <section>
      {embedded ? null : (
        <PageHeader
          crumbs={[brandCrumb, t("navigation.users")]}
          title={t("navigation.users")}
          subtitle={t("directory.usersIntro")}
        />
      )}
      <PolicyPacksPanel />
      <Card>
        <CardHeader
          title={t("directory.usersHeading")}
          subtitle={t("directory.usersCount", { count: totalUsers })}
          actions={
            <div className="flex items-center gap-2">
              <input
                className={`${controlCompactClassName} w-48`}
                type="search"
                value={search}
                placeholder={t("directory.searchPlaceholder")}
                aria-label={t("directory.searchPlaceholder")}
                onChange={(event) => {
                  setPageIndex(0);
                  setSearch(event.target.value);
                }}
              />
              <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
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
          <UsersTable
            visible={visible}
            canManageUsers={canManageUsers}
            onEditUser={setSelectedUserId}
          />
        )}
        {!isLoading && !errorKey && totalUsers > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3 text-[12px]">
            <span className="text-muted-foreground">
              {t("directory.usersPageRange", {
                from: firstVisible,
                to: lastVisible,
                total: totalUsers,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={t("directory.usersPreviousPage")}
                disabled={pageIndex === 0}
                onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              >
                <ChevronLeft size={14} /> {t("directory.usersPreviousPage")}
              </Button>
              <span className="tnum text-muted-foreground">
                {t("directory.usersPageOf", { page: pageIndex + 1, pages: totalPages })}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={t("directory.usersNextPage")}
                disabled={pageIndex + 1 >= totalPages}
                onClick={() => setPageIndex((current) => Math.min(totalPages - 1, current + 1))}
              >
                {t("directory.usersNextPage")} <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
      <UserDetailDrawer
        user={selectedUser}
        open={selectedUser !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedUserId(null);
        }}
        canManage={canManageUsers}
        canLinkDirectory={canLinkDirectory}
        isSelf={selectedUser?.id === currentUserId}
        originUnits={originUnits}
        services={services}
        onChanged={reload}
        onPasswordIssued={setPasswordReveal}
        onDeleted={() => setSelectedUserId(null)}
      />
    </section>
  );
}
