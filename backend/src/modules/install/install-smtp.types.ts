export type SaveInstallSmtpInput = {
  readonly enabled: boolean;
  readonly host?: string;
  readonly port?: number;
  readonly tls?: boolean;
  readonly username?: string;
  readonly password?: string;
  readonly fromAddress?: string;
};

export type InstallSmtpConfigurationFields = {
  readonly host: string;
  readonly port: number;
  readonly tls: boolean;
  readonly username: string;
  readonly password: string;
  readonly fromAddress: string;
};

export type ValidatedInstallSmtp =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly configuration: InstallSmtpConfigurationFields;
      readonly persistPassword: boolean;
    };

export type StoredInstallSmtp = {
  readonly enabled: unknown;
  readonly host: unknown;
  readonly port: unknown;
  readonly tls: unknown;
  readonly username: unknown;
  readonly password: unknown;
  readonly fromAddress: unknown;
  readonly emailAddonEnabled: unknown;
};

export type InstallSmtpEnvPrefill = {
  readonly host?: string;
  readonly port?: number;
  readonly tls?: boolean;
  readonly username?: string;
  readonly password?: string;
  readonly fromAddress?: string;
};

export type InstallSmtpPublicRecord = {
  readonly isConfigured: boolean;
  readonly enabled: boolean;
  readonly host: string;
  readonly port: number;
  readonly tls: boolean;
  readonly username: string;
  readonly fromAddress: string;
  readonly passwordConfigured: boolean;
  readonly emailAddonEnabled: boolean;
};

export type InstallSmtpStatus = {
  readonly smtp: InstallSmtpPublicRecord;
};
