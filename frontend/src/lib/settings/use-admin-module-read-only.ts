import {
  adminReadOnlyModuleKeys,
  isAdminModuleReadOnly,
  type AdminReadOnlyModuleKey,
} from "@/lib/settings/is-admin-module-read-only";
import { useSettingsRegistry } from "@/lib/settings/use-settings-registry";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function useAdminModuleReadOnly(moduleKey: AdminReadOnlyModuleKey) {
  const registry = useSettingsRegistry();
  const { session } = useSessionCapabilities();
  const isLocked =
    !registry.isLoading &&
    registry.errorKey === null &&
    isAdminModuleReadOnly(
      registry.entries,
      moduleKey,
      session === null
        ? null
        : {
            isSuperAdmin: session.isSuperAdmin,
            isLocalOnly: session.principal.isLocalOnly,
            roleKeys: session.roleKeys,
          },
    );
  return {
    isLocked,
    isLoading: registry.isLoading,
  };
}

export { adminReadOnlyModuleKeys };
