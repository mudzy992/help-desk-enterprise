import type { ServiceLifecycle } from "@/services/service-catalog-api";

export const serviceWorkspaceKinds = [
  "create",
  "edit",
  "onboarding",
  "form",
  "downtime",
  "lifecycle",
  "categories",
] as const;

export type ServiceWorkspaceKind = (typeof serviceWorkspaceKinds)[number];

export type ServiceWorkspaceState =
  | { readonly kind: "closed" }
  | { readonly kind: "create" | "categories" }
  | { readonly kind: "onboarding"; readonly serviceId: string | null }
  | {
      readonly kind: "edit" | "form" | "downtime" | "lifecycle";
      readonly serviceId: string;
    };

export interface ServiceCatalogUrlState {
  readonly query: string;
  readonly categoryId: string | null;
  readonly lifecycle: ServiceLifecycle | "ALL";
  readonly originUnitId: string | null;
  readonly workspace: ServiceWorkspaceKind | null;
  readonly serviceId: string | null;
}

const lifecycles: readonly ServiceLifecycle[] = ["DRAFT", "ACTIVE", "DEPRECATED"];

function isServiceLifecycle(value: string | null): value is ServiceLifecycle {
  return value !== null && lifecycles.some((lifecycle) => lifecycle === value);
}

function isServiceWorkspace(value: string | null): value is ServiceWorkspaceKind {
  return value !== null && serviceWorkspaceKinds.some((workspace) => workspace === value);
}

const workspacesWithService = new Set<ServiceWorkspaceKind>([
  "edit",
  "onboarding",
  "form",
  "downtime",
  "lifecycle",
]);
const workspacesRequiringService = new Set<ServiceWorkspaceKind>([
  "edit",
  "form",
  "downtime",
  "lifecycle",
]);

export function parseServiceCatalogUrl(params: URLSearchParams): ServiceCatalogUrlState {
  const lifecycleValue = params.get("lifecycle");
  const workspaceValue = params.get("workspace");
  const workspace = isServiceWorkspace(workspaceValue) ? workspaceValue : null;
  return {
    query: params.get("q") ?? "",
    categoryId: params.get("category"),
    lifecycle: isServiceLifecycle(lifecycleValue) ? lifecycleValue : "ALL",
    originUnitId: params.get("originUnit"),
    workspace,
    serviceId:
      workspace !== null && workspacesWithService.has(workspace) ? params.get("service") : null,
  };
}

export function resolveServiceWorkspace(state: ServiceCatalogUrlState): ServiceWorkspaceState {
  if (state.workspace === null) return { kind: "closed" };
  if (state.workspace === "create" || state.workspace === "categories") {
    return { kind: state.workspace };
  }
  if (state.workspace === "onboarding") {
    return { kind: "onboarding", serviceId: state.serviceId };
  }
  return state.serviceId === null
    ? { kind: "closed" }
    : { kind: state.workspace, serviceId: state.serviceId };
}

export function updateServiceCatalogUrl(
  current: URLSearchParams,
  patch: Partial<ServiceCatalogUrlState>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  const write = (key: string, value: string | null | undefined, defaultValue?: string) => {
    if (value === undefined) return;
    if (value === null || value === "" || value === defaultValue) next.delete(key);
    else next.set(key, value);
  };
  write("q", patch.query);
  write("category", patch.categoryId);
  write("lifecycle", patch.lifecycle, "ALL");
  write("originUnit", patch.originUnitId);
  write("workspace", patch.workspace);
  write("service", patch.serviceId);
  return next;
}

export function canonicalizeServiceCatalogUrl(
  state: ServiceCatalogUrlState,
  available: {
    readonly categoryIds: ReadonlySet<string>;
    readonly originUnitIds: ReadonlySet<string> | null;
    readonly serviceIds: ReadonlySet<string>;
  },
): Partial<ServiceCatalogUrlState> {
  const patch: { -readonly [Key in keyof ServiceCatalogUrlState]?: ServiceCatalogUrlState[Key] } =
    {};
  if (state.categoryId !== null && !available.categoryIds.has(state.categoryId)) {
    patch.categoryId = null;
  }
  if (
    state.originUnitId !== null &&
    available.originUnitIds !== null &&
    !available.originUnitIds.has(state.originUnitId)
  ) {
    patch.originUnitId = null;
  }
  if (state.serviceId !== null && !available.serviceIds.has(state.serviceId)) {
    patch.workspace = null;
    patch.serviceId = null;
  }
  if (
    state.workspace !== null &&
    workspacesRequiringService.has(state.workspace) &&
    state.serviceId === null
  ) {
    patch.workspace = null;
  }
  return patch;
}
