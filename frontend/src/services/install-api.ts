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

export type InstallLoginProviderMode = "local" | "entra_ad";

export type InstallLoginProviderRecord = {
  readonly mode: InstallLoginProviderMode;
  readonly entra: {
    readonly tenantIdConfigured: boolean;
    readonly clientIdConfigured: boolean;
  };
  readonly directoryBind: {
    readonly urls: string;
    readonly bindDnConfigured: boolean;
    readonly bindPasswordConfigured: boolean;
  };
};

export type InstallLoginProviderStatus = {
  readonly loginProvider: InstallLoginProviderRecord;
};

export type SaveInstallLoginProviderInput = {
  readonly mode: InstallLoginProviderMode;
  readonly azureTenantId?: string;
  readonly azureClientId?: string;
  readonly adLdapsUrlsCsv?: string;
  readonly adBindDn?: string;
  readonly adBindPassword?: string;
};

export function loadInstallSetupStatus(): Promise<InstallSetupStatus> {
  return apiRequest<InstallSetupStatus>("/install/status");
}

export function completeInstallSetup(): Promise<InstallSetupStatus> {
  return apiRequest<InstallSetupStatus>("/install/complete", {
    method: "POST",
  });
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

export function loadInstallLoginProvider(): Promise<InstallLoginProviderStatus> {
  return apiRequest<InstallLoginProviderStatus>("/install/login-provider");
}

export function saveInstallLoginProvider(
  input: SaveInstallLoginProviderInput,
): Promise<InstallLoginProviderRecord> {
  return apiRequest<InstallLoginProviderRecord>("/install/login-provider", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
