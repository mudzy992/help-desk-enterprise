import {
  adminReadOnlyModuleKeys,
  isAdminModuleReadOnly,
  type AdminReadOnlyModuleKey,
} from "@/lib/settings/is-admin-module-read-only";
import { useSettingsRegistry } from "@/lib/settings/use-settings-registry";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export type AdminModuleReadOnlyStatus = "loading" | "error" | "locked" | "unlocked";

export function useAdminModuleReadOnly(moduleKey: AdminReadOnlyModuleKey) {
  const registry = useSettingsRegistry();
  const { session } = useSessionCapabilities();
  const status: AdminModuleReadOnlyStatus = registry.isLoading
    ? "loading"
    : registry.errorKey !== null && registry.entries.length === 0
      ? "error"
      : isAdminModuleReadOnly(
            registry.entries,
            moduleKey,
            session === null
              ? null
              : {
                  isSuperAdmin: session.isSuperAdmin,
                  isLocalOnly: session.principal.isLocalOnly,
                  roleKeys: session.roleKeys,
                },
          )
        ? "locked"
        : "unlocked";

  return {
    status,
    isLocked: status === "locked",
    /** Write controls stay disabled until the policy has been resolved successfully. */
    canWrite: status === "unlocked",
    isLoading: status === "loading",
    errorKey: status === "error" ? registry.errorKey : null,
    requestId: status === "error" ? registry.requestId : null,
    retry: registry.reload,
  };
}

export { adminReadOnlyModuleKeys };
