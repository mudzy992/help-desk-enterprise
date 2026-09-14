import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";

export function canOpenConfigVersions(input: {
  readonly isSuperAdmin: boolean;
  readonly roleKeys: readonly string[];
}): boolean {
  return (
    input.isSuperAdmin ||
    input.roleKeys.includes(roleKeys.admin) ||
    input.roleKeys.includes(roleKeys.superAdmin)
  );
}

export function canWriteConfigVersions(input: {
  readonly isSuperAdmin: boolean;
  readonly permissionKeys: readonly string[];
}): boolean {
  return (
    input.isSuperAdmin ||
    input.permissionKeys.includes(permissionKeys.settingsWrite)
  );
}
