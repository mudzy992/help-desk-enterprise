import { apiRequest } from "@/services/api";

export type InstallSmtpRecord = {
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
  readonly smtp: InstallSmtpRecord;
};

export type SaveInstallSmtpInput = {
  readonly enabled: boolean;
  readonly host?: string;
  readonly port?: number;
  readonly tls?: boolean;
  readonly username?: string;
  readonly password?: string;
  readonly fromAddress?: string;
};

export function loadInstallSmtp(): Promise<InstallSmtpStatus> {
  return apiRequest<InstallSmtpStatus>("/install/smtp");
}

export function saveInstallSmtp(
  input: SaveInstallSmtpInput,
): Promise<InstallSmtpRecord> {
  return apiRequest<InstallSmtpRecord>("/install/smtp", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
