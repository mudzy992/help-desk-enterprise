import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { controlCompactClassName } from "@/components/ui/control";
import { mapUsersError, type UsersErrorKey } from "@/lib/users/map-users-error";
import { readApiRequestId } from "@/lib/map-api-error";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import {
  assignUserRole,
  listUserRoles,
  removeUserRole,
  type UserRoleResponse,
} from "@/services/users-api";
import type { ServiceResponse } from "@/services/service-catalog-api";
import {
  roleRequiresOrganizationalUnitForTicketScope,
  shouldShowOrganizationalUnitWildcardInRoleAssignment,
  shouldWarnOrganizationalUnitMissingForRoleAssignment,
} from "@/lib/users/user-role-organizational-unit-scope";

const assignableRoleKeys = ["USER", "AGENT", "ADMIN", "SUPER_ADMIN"] as const;

interface UserRolesSectionProperties {
  readonly userId: string;
  readonly originUnits: readonly OriginUnitOption[];
  readonly services: readonly ServiceResponse[];
}

export function UserRolesSection({
  userId,
  originUnits,
  services,
}: UserRolesSectionProperties) {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<readonly UserRoleResponse[]>([]);
  const [roleKey, setRoleKey] = useState<string>("AGENT");
  const [organizationalUnitId, setOrganizationalUnitId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<UsersErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      setRoles(await listUserRoles(userId));
    } catch (error) {
      setRoles([]);
      setErrorKey(mapUsersError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const showOrganizationalUnitWildcard =
    shouldShowOrganizationalUnitWildcardInRoleAssignment(roleKey);
  const showOrganizationalUnitScopeWarning =
    shouldWarnOrganizationalUnitMissingForRoleAssignment(
      roleKey,
      organizationalUnitId,
    );
  const canAssignRole =
    !roleRequiresOrganizationalUnitForTicketScope(roleKey) ||
    organizationalUnitId.trim().length > 0;

  const handleAssign = async () => {
    if (!canAssignRole) {
      return;
    }
    setPending(true);
    setErrorKey(null);
    try {
      await assignUserRole(userId, {
        roleKey,
        organizationalUnitId: organizationalUnitId.length > 0 ? organizationalUnitId : undefined,
        serviceId: serviceId.length > 0 ? serviceId : undefined,
      });
      await reload();
    } catch (error) {
      setErrorKey(mapUsersError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setPending(false);
    }
  };

  const handleRemove = async (userRoleId: string) => {
    setPending(true);
    setErrorKey(null);
    try {
      await removeUserRole(userId, userRoleId);
      await reload();
    } catch (error) {
      setErrorKey(mapUsersError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setPending(false);
    }
  };

  if (isLoading) {
    return <p className="px-4 py-3 text-[12px] text-muted-foreground">{t("users.rolesLoading")}</p>;
  }

  return (
    <div className="bg-elevated/20 px-4 py-3">
      {errorKey ? (
        <div className="mb-3">
          <ApiErrorText messageKey={errorKey} requestId={requestId} />
        </div>
      ) : null}
      <p className="text-[12px] font-medium text-foreground">{t("users.rolesHeading")}</p>
      {roles.length === 0 ? (
        <p className="mt-1 text-[12px] text-muted-foreground">{t("users.rolesEmpty")}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {roles.map((role) => (
            <li key={role.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span>
                {role.roleName}
                {role.organizationalUnitPath ? ` · ${role.organizationalUnitPath}` : ""}
                {role.serviceName ? ` · ${role.serviceName}` : ""}
              </span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={pending}
                onClick={() => void handleRemove(role.id)}
              >
                {t("users.removeRole")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <select
          className={controlCompactClassName}
          value={roleKey}
          aria-label={t("users.roleSelect")}
          onChange={(event) => setRoleKey(event.target.value)}
        >
          {assignableRoleKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        <select
          className={controlCompactClassName}
          value={organizationalUnitId}
          aria-label={t("users.organizationalUnitSelect")}
          onChange={(event) => setOrganizationalUnitId(event.target.value)}
        >
          {showOrganizationalUnitWildcard ? (
            <option value="">
              {t("users.scopeNoTicketAccessByOrganizationalUnit")}
            </option>
          ) : (
            <option value="" disabled>
              {t("users.scopeSelectOrganizationalUnit")}
            </option>
          )}
          {originUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}
            </option>
          ))}
        </select>
        <select
          className={controlCompactClassName}
          value={serviceId}
          aria-label={t("users.serviceSelect")}
          onChange={(event) => setServiceId(event.target.value)}
        >
          <option value="">{t("users.scopeAnyService")}</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          disabled={pending || !canAssignRole}
          onClick={() => void handleAssign()}
        >
          {pending ? t("users.assigningRole") : t("users.assignRole")}
        </Button>
      </div>
      {showOrganizationalUnitScopeWarning ? (
        <p
          role="status"
          className="mt-2 text-[12px] text-amber-700 dark:text-amber-400"
        >
          {t("users.scopeOrganizationalUnitRequiredWarning")}
        </p>
      ) : null}
    </div>
  );
}
