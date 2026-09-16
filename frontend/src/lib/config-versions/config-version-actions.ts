import {
  configVersionStatuses,
  type ConfigVersionStatus,
} from "@/services/config-versions-types";

export function canValidateConfigVersion(status: ConfigVersionStatus): boolean {
  return (
    status === configVersionStatuses.draft ||
    status === configVersionStatuses.validated ||
    status === configVersionStatuses.shadow
  );
}

export function canRunConfigVersionShadow(status: ConfigVersionStatus): boolean {
  return canValidateConfigVersion(status);
}

export function canActivateConfigVersion(status: ConfigVersionStatus): boolean {
  return (
    status === configVersionStatuses.draft ||
    status === configVersionStatuses.validated ||
    status === configVersionStatuses.shadow
  );
}

export function canRollbackConfigVersion(status: ConfigVersionStatus): boolean {
  return status === configVersionStatuses.active;
}
