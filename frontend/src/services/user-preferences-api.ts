import { apiRequest } from "@/services/api";

export type UserPreferences = {
  readonly preferredLocale: string | null;
};

export function getUserPreferences(): Promise<UserPreferences> {
  return apiRequest("/users/me/preferences");
}

export function updateUserPreferences(input: {
  readonly preferredLocale: string | null;
}): Promise<UserPreferences> {
  return apiRequest("/users/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
