import { emailChannelSettingKeys } from "@/services/settings-api";

const emailFeaturedKeys = new Set<string>(Object.values(emailChannelSettingKeys));

const featuredPrefixes = [
  "private.auth.",
  "private.smtp.",
  "private.addons.",
  "private.ticket.unroutedQueue.",
  "private.security.",
  "private.ticket.confidential.",
  "private.audit.",
  "private.readOnlyMode.",
  "private.install.",
] as const;

export function isFeaturedSettingKey(key: string): boolean {
  if (emailFeaturedKeys.has(key)) {
    return true;
  }
  return featuredPrefixes.some((prefix) => key.startsWith(prefix));
}

export function addonRegistryKey(addonKey: string): string {
  return `private.addons.${addonKey}`;
}

export const authSettingKeys = {
  mode: "private.auth.mode",
} as const;

export const smtpSettingKeys = {
  enabled: "private.smtp.enabled",
  host: "private.smtp.host",
  port: "private.smtp.port",
  tls: "private.smtp.tls",
  username: "private.smtp.username",
  password: "private.smtp.password",
  fromAddress: "private.smtp.fromAddress",
} as const;

export const unroutedSettingKeys = {
  enabled: "private.ticket.unroutedQueue.enabled",
  ownerRole: "private.ticket.unroutedQueue.ownerRole",
  // Paket 1.7 (U1/U2).
  targetGroupId: "private.ticket.unroutedQueue.targetGroupId",
  cleanupSlaHours: "private.ticket.unroutedQueue.cleanupSlaHours",
  weeklyDigest: "private.ticket.unroutedQueue.weeklyDigest",
} as const;

export const securityFeatureKeys = {
  redactionEnabled: "private.security.redaction.enabled",
  confidentialEnabled: "private.ticket.confidential.enabled",
  breakGlassEnabled: "private.ticket.confidential.breakGlassEnabled",
  auditExportEnabled: "private.audit.export.enabled",
  tamperEvidentEnabled: "private.audit.tamperEvident.enabled",
  readOnlyModeEnabled: "private.readOnlyMode.enabled",
} as const;

export const installSettingKeys = {
  completedAt: "private.install.completedAt",
} as const;
