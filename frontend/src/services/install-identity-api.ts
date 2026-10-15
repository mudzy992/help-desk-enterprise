import { apiRequest } from "@/services/api";

/**
 * Install wizard v2 (F2): the identity step — organisation, product name,
 * language, time zone and the brand mark. Everything the step writes is a normal
 * setting, so the same values are editable later in Settings → Brending.
 * `logoConfigured` is all the wizard ever learns about the logo; the data URL
 * itself is never read back.
 */
export type InstallIdentityLocale = "bs" | "en";

export type InstallIdentityRecord = {
  readonly organizationName: string;
  readonly appName: string;
  readonly tagline: string;
  readonly locale: InstallIdentityLocale;
  readonly timeZone: string;
  readonly logoConfigured: boolean;
  readonly supportEmail: string;
  readonly supportUrl: string;
  /** `organizationName` is stored: the step the wizard moves on from. */
  readonly isConfigured: boolean;
};

export type InstallIdentityStatus = {
  readonly identity: InstallIdentityRecord;
};

export type SaveInstallIdentityInput = {
  readonly organizationName: string;
  readonly appName?: string;
  readonly tagline?: string;
  readonly locale?: InstallIdentityLocale;
  readonly timeZone?: string;
  /** Omitted means "configure later": a stored logo is never overwritten. */
  readonly logoDataUrl?: string;
  readonly supportEmail?: string;
  readonly supportUrl?: string;
};

export function loadInstallIdentity(): Promise<InstallIdentityStatus> {
  return apiRequest<InstallIdentityStatus>("/install/identity");
}

export function saveInstallIdentity(
  input: SaveInstallIdentityInput,
): Promise<InstallIdentityRecord> {
  return apiRequest<InstallIdentityRecord>("/install/identity", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
