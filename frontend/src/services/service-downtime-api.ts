import { apiRequest } from "@/services/api";
import type { ServiceResponse } from "@/services/service-catalog-api";

export type DowntimeWindowPhase = "UPCOMING" | "ACTIVE" | "EXPIRED";

export type DowntimeWindowResponse = {
  readonly id: string;
  readonly serviceId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly message: string;
  readonly phase: DowntimeWindowPhase;
  readonly isActive: boolean;
  readonly isUpcoming: boolean;
  readonly isExpired: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateServiceDowntimeWindowInput = {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly message: string;
  readonly reason?: string;
};

export type UpdateServiceDowntimeWindowInput = {
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly message?: string;
  readonly reason?: string;
};

export function listServiceDowntimeWindows(
  serviceId: string,
): Promise<readonly DowntimeWindowResponse[]> {
  return apiRequest(`/services/${serviceId}/downtime-windows`);
}

export function createServiceDowntimeWindow(
  serviceId: string,
  input: CreateServiceDowntimeWindowInput,
): Promise<ServiceResponse> {
  return apiRequest(`/services/${serviceId}/downtime-windows`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateServiceDowntimeWindow(
  serviceId: string,
  downtimeWindowId: string,
  input: UpdateServiceDowntimeWindowInput,
): Promise<ServiceResponse> {
  return apiRequest(`/services/${serviceId}/downtime-windows/${downtimeWindowId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteServiceDowntimeWindow(
  serviceId: string,
  downtimeWindowId: string,
  reason?: string,
): Promise<ServiceResponse> {
  const query =
    reason !== undefined && reason.length > 0
      ? `?reason=${encodeURIComponent(reason)}`
      : "";
  return apiRequest(
    `/services/${serviceId}/downtime-windows/${downtimeWindowId}${query}`,
    { method: "DELETE" },
  );
}

export function countUpcomingDowntimeWindows(
  windows: readonly DowntimeWindowResponse[],
): number {
  return windows.filter((window) => window.phase === "UPCOMING").length;
}

export function listManagedDowntimeWindows(
  windows: readonly DowntimeWindowResponse[],
): readonly DowntimeWindowResponse[] {
  return windows.filter(
    (window) => window.phase === "ACTIVE" || window.phase === "UPCOMING",
  );
}
