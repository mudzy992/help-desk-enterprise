import { apiRequest } from "@/services/api";

export type InstallSeedRecord = {
  readonly isSeeded: boolean;
  /** F2: the category the first service lives in (may be an existing one). */
  readonly categoryName: string | null;
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
    readonly organizationalUnitId: string | null;
  } | null;
  readonly service: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly lifecycle: string;
    /** F2: the profile the first tickets get their clocks from. */
    readonly slaProfileKey?: string | null;
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

/** F2: the names the operator typed, next to the records that already exist. */
export type InstallSeedWarning = {
  readonly code: "NAMES_ALREADY_SEEDED";
  readonly requested: InstallSeedStructureNames;
  readonly stored: InstallSeedStructureNames;
};

export type InstallSeedStructureNames = {
  readonly organizationalUnitName: string;
  readonly handlerGroupName: string;
  readonly categoryName: string;
  readonly serviceName: string;
};

export type InstallSeedSubmitResult = InstallSeedRecord & {
  readonly created?: Readonly<Record<string, boolean>>;
  readonly warning?: InstallSeedWarning;
};

export type InstallSeedStatus = {
  readonly seed: InstallSeedRecord;
};

/** F2: the structure step posts what it shows; an empty body keeps the defaults. */
export type RunInstallSeedInput = {
  readonly organizationalUnitName: string;
  readonly handlerGroupName: string;
  readonly serviceName: string;
  readonly categoryName: string;
};

export function loadInstallSeed(): Promise<InstallSeedStatus> {
  return apiRequest<InstallSeedStatus>("/install/seed");
}

export function runInstallSeed(input?: RunInstallSeedInput): Promise<InstallSeedSubmitResult> {
  return apiRequest<InstallSeedSubmitResult>("/install/seed", {
    method: "POST",
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}
