import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PermissionsCatalogList } from "@/components/rbac/permissions-catalog-list";
import { PermissionsPreviewPanel } from "@/components/rbac/permissions-preview-panel";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { controlCompactClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { groupPermissionsByCategory } from "@/lib/rbac/group-permissions-by-category";
import { mapRbacError, type RbacErrorKey } from "@/lib/rbac/map-rbac-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  getRolePermissions,
  listPermissionCatalog,
  listRoles,
  previewRolePermissions,
  replaceRolePermissions,
  type PermissionCatalogEntry,
  type RolePermissionPreviewResponse,
  type RoleSummaryResponse,
} from "@/services/rbac-api";

export function PermissionsPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [roles, setRoles] = useState<readonly RoleSummaryResponse[]>([]);
  const [catalog, setCatalog] = useState<readonly PermissionCatalogEntry[]>([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState("");
  const [enabledKeys, setEnabledKeys] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState<RolePermissionPreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<RbacErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  /**
   * W7.72: the save is committed, but the refresh that follows it failed. Before
   * this flag the panel reported that refresh failure as a failed save.
   */
  const [savedNotRefreshed, setSavedNotRefreshed] = useState(false);
  const groups = useMemo(() => groupPermissionsByCategory(catalog), [catalog]);

  const loadRolePermissions = useCallback(async (roleKey: string) => {
    setEnabledKeys(await getRolePermissions(roleKey));
  }, []);

  const reload = useCallback(
    async (roleKey?: string): Promise<boolean> => {
      setIsLoading(true);
      setErrorKey(null);
      setRequestId(null);
      setPreview(null);
      setSavedNotRefreshed(false);
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
        return true;
      } catch (error) {
        setErrorKey(mapRbacError(error));
        setRequestId(readApiRequestId(error));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [loadRolePermissions],
  );

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

  const handleConfirmSave = async (reason: string) => {
    if (selectedRoleKey.length === 0 || preview === null) {
      return;
    }
    setPending(true);
    setErrorKey(null);
    setRequestId(null);
    setSavedNotRefreshed(false);
    try {
      // Paket 5.1 (M4 B2): the token proves the preview ran for this set.
      await replaceRolePermissions(selectedRoleKey, enabledKeys, preview.previewToken, reason);
    } catch (error) {
      // The write itself was refused: no permission changed.
      setErrorKey(mapRbacError(error));
      setRequestId(readApiRequestId(error));
      setPending(false);
      return;
    }
    setPreview(null);
    toast({ tone: "success", title: t("permissions.saved") });
    // W7.72: the permissions are committed at this point. Loading the confirmed
    // state is a second, guarded request; if it fails, the operator must not be
    // told the save failed (that message cost a whole triage cycle).
    const refreshed = await reload(selectedRoleKey);
    if (!refreshed) {
      // `reload` already recorded the failing request id; only its message was
      // wrong, because the write did commit.
      setErrorKey(null);
      setSavedNotRefreshed(true);
      toast({ tone: "warning", title: t("permissions.savedRefreshFailed") });
    }
    setPending(false);
  };

  if (isLoading) {
    return <PanelSkeleton label={t("permissions.heading")} />;
  }

  return (
    <Card className="fade-in">
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
      {savedNotRefreshed ? (
        <div className="px-4 pb-3">
          <div
            role="status"
            className="grid gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2"
            data-testid="permissions-saved-not-refreshed"
          >
            <p className="text-[12.5px] font-medium text-foreground">
              {t("permissions.savedRefreshFailed")}
            </p>
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void reload(selectedRoleKey)}
              >
                {t("permissions.refreshAction")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <PermissionsCatalogList groups={groups} enabledKeys={enabledKeys} onToggle={handleToggle} />
      <div className="border-t border-border/70 px-4 py-3">
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
            onConfirm={(reason) => void handleConfirmSave(reason)}
          />
        </div>
      ) : null}
    </Card>
  );
}
