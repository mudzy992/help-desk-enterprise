import { apiRequest } from "@/services/api";

export type InstallSetupStatus = {
  readonly isCompleted: boolean;
};

export function loadInstallSetupStatus(): Promise<InstallSetupStatus> {
  return apiRequest<InstallSetupStatus>("/install/status");
}
