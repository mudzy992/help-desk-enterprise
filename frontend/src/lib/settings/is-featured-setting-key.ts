import { emailChannelSettingKeys } from "@/services/settings-api";

const emailFeaturedKeys = new Set<string>(Object.values(emailChannelSettingKeys));

export function isFeaturedSettingKey(key: string): boolean {
  if (emailFeaturedKeys.has(key)) {
    return true;
  }
  return key.startsWith("private.addons.");
}
