import { permissionKeys } from "@/lib/session/permission-keys";

export function canManageIntegrationQueue(input: {
  readonly isSuperAdmin: boolean;
  readonly permissionKeys: readonly string[];
}): boolean {
  return (
    input.isSuperAdmin ||
    input.permissionKeys.includes(permissionKeys.integrationsQueueManage)
  );
}
