import { apiRequest } from "@/services/api";
import type { InstallProfile } from "@/services/install-profile-api";
import type { InstallStepKey, InstallWizardStep } from "@/services/install-step-key";

export type { InstallStepKey, InstallWizardStep } from "@/services/install-step-key";

export type InstallStepState = {
  readonly completed: boolean;
  readonly skipped?: boolean;
  /** F1: required by the package in effect (which defaults to `minimum`). */
  readonly required?: boolean;
  /** F1: present in the wizard of the package in effect. */
  readonly offered?: boolean;
  /** F1: still standing between the wizard and the final screen. */
  readonly blocking?: boolean;
  /** F3: the registry allows “Podesi kasnije” for this step. */
  readonly skippable?: boolean;
};

export type InstallSetupStatus = {
  readonly isCompleted: boolean;
  readonly nextStep?: InstallWizardStep;
  /** F1: the package chosen in the wizard; `null` while none is stored. */
  readonly profile?: InstallProfile | null;
  readonly steps?: Readonly<Record<InstallStepKey, InstallStepState>>;
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

/**
 * Paket 5.1 (M1 #1): the rules the install wizard must state before it posts
 * the founder account — the server used to be stricter than the hard-coded 12.
 */
export type InstallPasswordPolicy = {
  readonly minLength: number;
  readonly maxLength: number;
  readonly blocklistEnabled: boolean;
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

/**
 * F0.1: the token gate probes a candidate token before it is persisted, so the
 * request may carry it explicitly. Every other caller reads the stored one.
 */
export function loadInstallSuperAdmin(token?: string): Promise<InstallSuperAdminStatus> {
  return apiRequest<InstallSuperAdminStatus>(
    "/install/super-admin",
    token === undefined ? {} : { headers: { "X-Install-Token": token } },
  );
}

export function loadInstallPasswordPolicy(): Promise<InstallPasswordPolicy> {
  return apiRequest<InstallPasswordPolicy>("/install/password-policy");
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
