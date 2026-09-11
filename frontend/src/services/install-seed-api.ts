import { apiRequest } from "@/services/api";

export type InstallSeedRecord = {
  readonly isSeeded: boolean;
  readonly organizationalUnit: {
    readonly id: string;
    readonly name: string;
    readonly ouPath: string;
  } | null;
  readonly fallbackGroup: {
    readonly id: string;
    readonly name: string;
    readonly key: string;
    readonly isFallback: boolean;
  } | null;
  readonly service: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly lifecycle: string;
  } | null;
  readonly routingRule: {
    readonly id: string;
    readonly originUnitId: string;
    readonly serviceId: string;
    readonly groupId: string;
  } | null;
  readonly resolution: {
    readonly outcome: string;
    readonly groupId: string | null;
    readonly fallbackDepth: number;
  } | null;
};

export type InstallSeedStatus = {
  readonly seed: InstallSeedRecord;
};

export function loadInstallSeed(): Promise<InstallSeedStatus> {
  return apiRequest<InstallSeedStatus>("/install/seed");
}

export function runInstallSeed(): Promise<InstallSeedRecord> {
  return apiRequest<InstallSeedRecord>("/install/seed", {
    method: "POST",
  });
}
