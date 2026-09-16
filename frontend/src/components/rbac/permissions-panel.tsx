import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PermissionsPreviewPanel } from "@/components/rbac/permissions-preview-panel";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { controlCompactClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { mapRbacError, type RbacErrorKey } from "@/lib/rbac/map-rbac-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  getRolePermissions,
  listPermissionCatalog,
  listRoles,
  previewRolePermissions,
  replaceRolePermissions,
  type RolePermissionPreviewResponse,
  type RoleSummaryResponse,
} from "@/services/rbac-api";

export function PermissionsPanel() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<readonly RoleSummaryResponse[]>([]);
  const [catalog, setCatalog] = useState<readonly string[]>([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState("");
  const [enabledKeys, setEnabledKeys] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState<RolePermissionPreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<RbacErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const loadRolePermissions = useCallback(async (roleKey: string) => {
    const permissions = await getRolePermissions(roleKey);
    setEnabledKeys(permissions);
  }, []);

  const reload = useCallback(async (roleKey?: string) => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    setPreview(null);
    try {
      const [loadedRoles, loadedCatalog] = await Promise.all([
        listRoles(),
        listPermissionCatalog(),
      ]);
      setRoles(loadedRoles);
      setCatalog(loadedCatalog);
      const nextRole = roleKey ?? loadedRoles[0]?.key ?? "";
      setSelectedRoleKey(nextRole);
      if (nextRole.length > 0) {
        await loadRolePermissions(nextRole);
      }
    } catch (error) {
      setErrorKey(mapRbacError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [loadRolePermissions]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRoleChange = async (roleKey: string) => {
    setSelectedRoleKey(roleKey);
    setPreview(null);
    setErrorKey(null);
    try {
      await loadRolePermissions(roleKey);
    } catch (error) {
      setErrorKey(mapRbacError(error));
      setRequestId(readApiRequestId(error));
    }
  };

  const handleToggle = (permissionKey: string, checked: boolean) => {
    setPreview(null);
    setEnabledKeys((current) =>
      checked
        ? [...new Set([...current, permissionKey])].sort()
        : current.filter((key) => key !== permissionKey),
    );
  };

  const handlePreview = async () => {
    if (selectedRoleKey.length === 0) {
      return;
    }
    setPending(true);
    setErrorKey(null);
    try {
      setPreview(await previewRolePermissions(selectedRoleKey, enabledKeys));
    } catch (error) {
      setPreview(null);
      setErrorKey(mapRbacError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setPending(false);
    }
  };

  const handleConfirmSave = async () => {
    if (selectedRoleKey.length === 0) {
      return;
    }
    setPending(true);
    setErrorKey(null);
    try {
      await replaceRolePermissions(selectedRoleKey, enabledKeys);
      setPreview(null);
      await reload(selectedRoleKey);
    } catch (error) {
      setErrorKey(mapRbacError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setPending(false);
    }
  };

  if (isLoading) {
    return <PanelSkeleton label={t("permissions.heading")} />;
  }

  return (
    <Card>
      <CardHeader
        title={t("permissions.heading")}
        subtitle={t("permissions.intro")}
        actions={
          <select
            className={`${controlCompactClassName} min-w-40`}
            value={selectedRoleKey}
            aria-label={t("permissions.roleSelect")}
            onChange={(event) => void handleRoleChange(event.target.value)}
          >
            {roles.map((role) => (
              <option key={role.key} value={role.key}>
                {role.name} ({role.permissionCount})
              </option>
            ))}
          </select>
        }
      />
      {errorKey ? (
        <div className="px-4 pb-3">
          <ApiErrorText messageKey={errorKey} requestId={requestId} />
        </div>
      ) : null}
      <div className="divide-y divide-border/50 px-4 pb-4">
        {catalog.map((permissionKey) => {
          const checked = enabledKeys.includes(permissionKey);
          return (
            <label
              key={permissionKey}
              className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]"
            >
              <span className="font-mono text-[12px] text-foreground">{permissionKey}</span>
              <Switch
                checked={checked}
                aria-label={permissionKey}
                onCheckedChange={(value) => handleToggle(permissionKey, value)}
              />
            </label>
          );
        })}
      </div>
      <div className="border-t border-border/60 px-4 py-3">
        <Button type="button" size="sm" onClick={() => void handlePreview()} disabled={pending}>
          {t("permissions.previewAction")}
        </Button>
      </div>
      {preview ? (
        <div className="px-4 pb-4">
          <PermissionsPreviewPanel
            preview={preview}
            pending={pending}
            onCancel={() => setPreview(null)}
            onConfirm={() => void handleConfirmSave()}
          />
        </div>
      ) : null}
    </Card>
  );
}
