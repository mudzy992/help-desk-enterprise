import { apiRequest } from "@/services/api";

export type InstallSetupStatus = {
  readonly isCompleted: boolean;
};

export type InstallSuperAdminRecord = {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly isLocalOnly: boolean;
};

export type InstallSuperAdminStatus = {
  readonly superAdmin: InstallSuperAdminRecord | null;
};

export type CreateInstallSuperAdminInput = {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
};

export function loadInstallSetupStatus(): Promise<InstallSetupStatus> {
  return apiRequest<InstallSetupStatus>("/install/status");
}

export function loadInstallSuperAdmin(): Promise<InstallSuperAdminStatus> {
  return apiRequest<InstallSuperAdminStatus>("/install/super-admin");
}

export function createInstallSuperAdmin(
  input: CreateInstallSuperAdminInput,
): Promise<InstallSuperAdminRecord> {
  return apiRequest<InstallSuperAdminRecord>("/install/super-admin", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
