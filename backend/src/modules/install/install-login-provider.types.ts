import type { AuthenticationMode } from '../authentication/authentication.types';

export type SaveInstallLoginProviderInput = {
  readonly mode: AuthenticationMode;
  readonly azureTenantId?: string;
  readonly azureClientId?: string;
  readonly adLdapsUrlsCsv?: string;
  readonly adBindDn?: string;
  readonly adBindPassword?: string;
};

export type InstallEntraConfigurationFields = {
  readonly tenantId: string;
  readonly clientId: string;
};

export type InstallLdapsBindConfigurationFields = {
  readonly urlsCsv: string;
  readonly bindDn: string;
  readonly bindPassword: string;
};

export type ValidatedInstallLoginProvider =
  | { readonly mode: 'local' }
  | {
      readonly mode: 'entra_ad';
      readonly entra: InstallEntraConfigurationFields | null;
      readonly directoryBind: InstallLdapsBindConfigurationFields | null;
    };

export type StoredInstallLoginProviderSecrets = {
  readonly azureTenantId: unknown;
  readonly azureClientId: unknown;
  readonly adLdapsUrlsCsv: unknown;
  readonly adBindDn: unknown;
  readonly adBindPassword: unknown;
};

export type InstallLoginProviderPublicRecord = {
  readonly mode: AuthenticationMode;
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
  readonly loginProvider: InstallLoginProviderPublicRecord;
};
