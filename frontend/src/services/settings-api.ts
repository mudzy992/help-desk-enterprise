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

export function getEmailChannelSettings(): Promise<EmailChannelSettings> {
  return apiRequest("/settings/email-channel");
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
