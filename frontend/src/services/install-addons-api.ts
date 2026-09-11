import { apiRequest } from "@/services/api";

export type InstallAddonItem = {
  readonly key: string;
  readonly enabled: boolean;
  readonly defaultEnabled: boolean;
  readonly canEnable: boolean;
};

export type InstallAddonsRecord = {
  readonly smtpEnabled: boolean;
  readonly items: readonly InstallAddonItem[];
};

export type InstallAddonsStatus = {
  readonly addons: InstallAddonsRecord;
};

export type SaveInstallAddonsInput = {
  readonly addons: Readonly<Record<string, boolean>>;
};

export function loadInstallAddons(): Promise<InstallAddonsStatus> {
  return apiRequest<InstallAddonsStatus>("/install/addons");
}

export function saveInstallAddons(
  input: SaveInstallAddonsInput,
): Promise<InstallAddonsRecord> {
  return apiRequest<InstallAddonsRecord>("/install/addons", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
