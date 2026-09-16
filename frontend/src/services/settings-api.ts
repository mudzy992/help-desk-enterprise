import { apiRequest } from "@/services/api";

export type EmailChannelSettings = {
  readonly smtpEnabled: boolean;
  readonly emailAddonEnabled: boolean;
  readonly channelEnabled: boolean;
  readonly deliveryEnabled: boolean;
  readonly templatesEnabled: boolean;
  readonly internalOnly: boolean;
  readonly allowedExternalDomainsCsv: string;
  readonly allowedExternalEmailsCsv: string;
  readonly templatesJson: string;
  readonly hasSmtpTransport: boolean;
};

export type SettingValueTypeName = "string" | "number" | "boolean";
export type SettingVisibility = "public" | "private" | "secret";

export type SettingRegistryEntry = {
  readonly key: string;
  readonly description: string;
  readonly valueType: SettingValueTypeName;
  readonly visibility: SettingVisibility;
  readonly isRequired: boolean;
  readonly defaultValue: string | number | boolean | null;
  readonly value: string | number | boolean | null;
  readonly isSet: boolean;
  readonly allowedValues?: readonly string[];
};

export function getEmailChannelSettings(): Promise<EmailChannelSettings> {
  return apiRequest("/settings/email-channel");
}

export function getSettingsRegistry(): Promise<readonly SettingRegistryEntry[]> {
  return apiRequest("/settings");
}

export function getPublicSettings(): Promise<
  Readonly<Record<string, string | number | boolean | null | undefined>>
> {
  return apiRequest("/settings/public");
}

export function updateSetting(input: {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly reason: string;
}): Promise<void> {
  return apiRequest("/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export const emailChannelSettingKeys = {
  channelEnabled: "private.notifications.email.enabled",
  templatesEnabled: "private.notifications.templates.enabled",
  internalOnly: "private.notifications.email.internalOnly",
  allowedExternalDomainsCsv:
    "private.notifications.email.allowedExternalDomainsCsv",
  allowedExternalEmailsCsv:
    "private.notifications.email.allowedExternalEmailsCsv",
  templatesJson: "private.notifications.templates.registryJson",
} as const;
