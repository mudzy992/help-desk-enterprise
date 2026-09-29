import { apiRequest } from "@/services/api";

export type UserPreferences = {
  readonly preferredLocale: string | null;
  /** Paket 2.8 §4.3: explicit choice; null = default by role. */
  readonly keyboardShortcuts?: boolean | null;
  readonly keyboardShortcutsEffective?: boolean;
  readonly keyboardShortcutsDefault?: boolean;
};

export function getUserPreferences(): Promise<UserPreferences> {
  return apiRequest("/users/me/preferences");
}

export function updateUserPreferences(input: {
  readonly preferredLocale?: string | null;
  readonly keyboardShortcuts?: boolean | null;
}): Promise<UserPreferences> {
  return apiRequest("/users/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
