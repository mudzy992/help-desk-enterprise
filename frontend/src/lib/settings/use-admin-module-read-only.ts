import {
  adminReadOnlyModuleKeys,
  isAdminModuleReadOnly,
  type AdminReadOnlyModuleKey,
} from "@/lib/settings/is-admin-module-read-only";
import { useSettingsRegistry } from "@/lib/settings/use-settings-registry";

export function useAdminModuleReadOnly(moduleKey: AdminReadOnlyModuleKey) {
  const registry = useSettingsRegistry();
  const isLocked =
    !registry.isLoading &&
    registry.errorKey === null &&
    isAdminModuleReadOnly(registry.entries, moduleKey);
  return {
    isLocked,
    isLoading: registry.isLoading,
  };
}

export { adminReadOnlyModuleKeys };
