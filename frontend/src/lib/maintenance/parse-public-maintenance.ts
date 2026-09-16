export const publicMaintenanceSettingKeys = {
  enabled: "public.maintenance.enabled",
  message: "public.maintenance.message",
  fromAt: "public.maintenance.fromAt",
  toAt: "public.maintenance.toAt",
  scope: "public.maintenance.scope",
  affectedServicesCsv: "public.maintenance.affectedServicesCsv",
  isBlocking: "public.maintenance.isBlocking",
} as const;

export type MaintenanceScope = "global" | "per_service" | "both";

export type PublicMaintenanceState = {
  readonly enabled: boolean;
  readonly message: string;
  readonly fromAt: string;
  readonly toAt: string;
  readonly scope: MaintenanceScope;
  readonly affectedServiceTokens: readonly string[];
};

function readString(
  snapshot: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = snapshot[key];
  return typeof value === "string" ? value : "";
}

function parseScope(value: string): MaintenanceScope {
  if (value === "global" || value === "per_service" || value === "both") {
    return value;
  }
  return "both";
}

export function parsePublicMaintenance(
  snapshot: Readonly<Record<string, unknown>>,
): PublicMaintenanceState {
  const enabled = snapshot[publicMaintenanceSettingKeys.enabled] === true;
  const csv = readString(
    snapshot,
    publicMaintenanceSettingKeys.affectedServicesCsv,
  );
  return {
    enabled,
    message: readString(snapshot, publicMaintenanceSettingKeys.message),
    fromAt: readString(snapshot, publicMaintenanceSettingKeys.fromAt),
    toAt: readString(snapshot, publicMaintenanceSettingKeys.toAt),
    scope: parseScope(
      readString(snapshot, publicMaintenanceSettingKeys.scope),
    ),
    affectedServiceTokens: csv
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0),
  };
}

export function shouldShowGlobalMaintenanceBanner(
  state: PublicMaintenanceState,
): boolean {
  if (!state.enabled) {
    return false;
  }
  return state.scope === "global" || state.scope === "both";
}

export function isServiceListedInMaintenance(
  state: PublicMaintenanceState,
  service: { readonly id: string; readonly name: string; readonly slug: string },
): boolean {
  if (!state.enabled) {
    return false;
  }
  if (state.scope !== "per_service" && state.scope !== "both") {
    return false;
  }
  const tokens = new Set(state.affectedServiceTokens);
  return (
    tokens.has(service.id.toLowerCase()) ||
    tokens.has(service.name.toLowerCase()) ||
    tokens.has(service.slug.toLowerCase())
  );
}
