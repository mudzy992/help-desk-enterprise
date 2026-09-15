import type { ServiceLifecycle } from "@/services/service-catalog-api";

export const allowedServiceLifecycleTransitions: Readonly<
  Record<ServiceLifecycle, readonly ServiceLifecycle[]>
> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["DEPRECATED"],
  DEPRECATED: ["ACTIVE"],
};

export type ServiceLifecycleActionLabelKey =
  | "services.activate"
  | "services.deprecate"
  | "services.reactivate";

export function nextServiceLifecycleTargets(
  lifecycle: ServiceLifecycle,
): readonly ServiceLifecycle[] {
  return allowedServiceLifecycleTransitions[lifecycle];
}

export function canDeleteCatalogService(lifecycle: ServiceLifecycle): boolean {
  return lifecycle === "DRAFT";
}

export function serviceLifecycleActionLabelKey(
  from: ServiceLifecycle,
  to: ServiceLifecycle,
): ServiceLifecycleActionLabelKey {
  if (to === "DEPRECATED") {
    return "services.deprecate";
  }
  if (from === "DRAFT") {
    return "services.activate";
  }
  return "services.reactivate";
}
