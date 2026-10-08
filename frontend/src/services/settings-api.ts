import { apiRequest } from "@/services/api";
import type { InstallAddonsStatus } from "@/services/install-addons-api";

export type EmailChannelSettings = {
  readonly smtpEnabled: boolean;
  readonly emailAddonEnabled: boolean;
  readonly channelEnabled: boolean;
  readonly deliveryEnabled: boolean;
  readonly templatesEnabled: boolean;
  readonly internalOnly: boolean;
  readonly internalDomainsCsv: string;
  readonly allowedExternalDomainsCsv: string;
  readonly allowedExternalEmailsCsv: string;
  readonly templatesJson: string;
  readonly hasSmtpTransport: boolean;
};

export type SettingValueTypeName = "string" | "number" | "boolean";
export type SettingVisibility = "public" | "private" | "secret";

/**
 * Paket 5.3.3/5.3.4: a condition another setting has to satisfy before this one
 * may be switched on. `equals`/`oneOf` compare the effective value (stored
 * value, otherwise the default); `isSet`/`notEmpty` are the only questions a
 * secret can answer.
 */
export type SettingCondition =
  | { readonly key: string; readonly equals: string | number | boolean }
  | { readonly key: string; readonly oneOf: readonly (string | number | boolean)[] }
  | { readonly key: string; readonly isSet: true }
  | { readonly key: string; readonly notEmpty: true };

export type SettingRegistryEntry = {
  readonly key: string;
  readonly description: string;
  readonly categoryId: string;
  readonly categoryIcon: string;
  readonly categoryPriority: number;
  readonly valueType: SettingValueTypeName;
  readonly visibility: SettingVisibility;
  readonly isRequired: boolean;
  readonly defaultValue: string | number | boolean | null;
  readonly value: string | number | boolean | null;
  readonly isSet: boolean;
  readonly allowedValues?: readonly string[];
  /** Paket 5.3.3: resolved i18n keys — title is the human line, help the modal body. */
  readonly titleKey: string;
  readonly helpKey: string;
  /** Optional visual grouping inside the category (stable, free-form id). */
  readonly group: string | null;
  /** Conditions that must hold before this setting may be active. */
  readonly requires: readonly SettingCondition[];
};

/** Paket 5.3.3 (D7): one dependent the server would change on a switch-off. */
export type SettingDependentReset = {
  readonly key: string;
  readonly action: "reset_to_default" | "disable" | "delete";
  /** Present for `reset_to_default` and `disable`: the value written back. */
  readonly value?: string | number | boolean;
  /** The key in the same request whose switch-off caused this reset. */
  readonly causedBy: string;
};

/** Paket 5.3.3: both write endpoints answer 200 with what actually changed. */
export type SettingsWriteResponse = {
  readonly updatedKeys: readonly string[];
  readonly resetDependents: readonly SettingDependentReset[];
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

/**
 * `resetDependents` is the administrator's confirmation: without it the server
 * refuses a write that would leave an active dependent without its parent.
 */
export function updateSetting(input: {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly reason: string;
  readonly resetDependents?: boolean;
}): Promise<SettingsWriteResponse> {
  return apiRequest("/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** Paket 4.1: several keys under one reason, saved all-or-nothing. */
export function updateSettings(input: {
  readonly entries: readonly { readonly key: string; readonly value: string | number | boolean }[];
  readonly reason: string;
  readonly resetDependents?: boolean;
}): Promise<SettingsWriteResponse> {
  return apiRequest("/settings/batch", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/**
 * Paket 5.3.4 (ispravka 2026-10-08): the addon catalogue with the **stored**
 * values, for the authenticated settings tab. `GET /install/addons` is the
 * public wizard route — since the 5.2 fix (M1 #5) it answers with the static
 * defaults after the installation, so a switch rendered from it could never
 * show that an addon had been switched on.
 */
export function loadSettingsAddons(): Promise<InstallAddonsStatus> {
  return apiRequest("/settings/addons");
}

/** Paket 5.3.3: exactly what switching this key off would change right now. */
export function getSettingDependents(
  key: string,
): Promise<readonly SettingDependentReset[]> {
  return apiRequest(`/settings/dependents?key=${encodeURIComponent(key)}`);
}

export const emailChannelSettingKeys = {
  channelEnabled: "private.notifications.email.enabled",
  templatesEnabled: "private.notifications.templates.enabled",
  internalOnly: "private.notifications.email.internalOnly",
  internalDomainsCsv: "private.notifications.email.internalDomainsCsv",
  allowedExternalDomainsCsv:
    "private.notifications.email.allowedExternalDomainsCsv",
  allowedExternalEmailsCsv:
    "private.notifications.email.allowedExternalEmailsCsv",
  templatesJson: "private.notifications.templates.registryJson",
  replyMode: "private.notifications.email.replyMode",
  replyToAddress: "private.notifications.email.replyToAddress",
  includeMessageExcerpt: "private.notifications.email.includeMessageExcerpt",
  accentColor: "private.notifications.email.accentColor",
} as const;
