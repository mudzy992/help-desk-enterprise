import { ApiError, apiRequest, apiRequestValidated } from "@/services/api";
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

export type DowntimeWindowListPage = {
  readonly items: readonly DowntimeWindowResponse[];
  readonly total: number;
  readonly take: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly period: { readonly from: string; readonly to: string };
};

export type DowntimeWindowListQuery = {
  readonly take?: number;
  readonly cursor?: string | null;
  readonly from?: string;
  readonly to?: string;
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

export const serviceDowntimeWindowListPageSize = 100;
export const serviceDowntimeWindowListMaximumPages = 10;

export function listServiceDowntimeWindowPage(
  serviceId: string,
  query: DowntimeWindowListQuery = {},
): Promise<DowntimeWindowListPage> {
  const params = new URLSearchParams();
  if (query.take !== undefined) params.set("take", String(query.take));
  if (query.cursor !== undefined && query.cursor !== null) params.set("cursor", query.cursor);
  if (query.from !== undefined) params.set("from", query.from);
  if (query.to !== undefined) params.set("to", query.to);
  const serialized = params.toString();
  const path =
    serialized.length === 0
      ? `/services/${serviceId}/downtime-windows`
      : `/services/${serviceId}/downtime-windows?${serialized}`;
  return apiRequestValidated(path, parseDowntimeWindowPage);
}

export function listServiceDowntimeWindows(
  serviceId: string,
): Promise<readonly DowntimeWindowResponse[]> {
  return collectServiceDowntimeWindowPages((query) =>
    listServiceDowntimeWindowPage(serviceId, query),
  );
}

export async function collectServiceDowntimeWindowPages(
  loadPage: (query: DowntimeWindowListQuery) => Promise<DowntimeWindowListPage>,
): Promise<readonly DowntimeWindowResponse[]> {
  const windows: DowntimeWindowResponse[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let period: DowntimeWindowListPage["period"] | null = null;
  for (let pageNumber = 0; pageNumber < serviceDowntimeWindowListMaximumPages; pageNumber += 1) {
    const page = await loadPage({
      take: serviceDowntimeWindowListPageSize,
      cursor,
      ...(period === null ? {} : { from: period.from, to: period.to }),
    });
    windows.push(...page.items);
    period = page.period;
    if (!page.hasMore) return windows;
    if (page.nextCursor === null || seenCursors.has(page.nextCursor) || page.items.length === 0) {
      throw new ApiError(
        502,
        "INVALID_DOWNTIME_WINDOW_PAGINATION",
        "Downtime window pagination did not advance safely",
      );
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new ApiError(
    502,
    "DOWNTIME_WINDOW_RESOURCE_LIMIT_EXCEEDED",
    `Downtime windows exceed the ${serviceDowntimeWindowListMaximumPages * serviceDowntimeWindowListPageSize}-item client aggregation ceiling. Filter the period to load a narrower range.`,
  );
}

function parseDowntimeWindowPage(value: unknown): DowntimeWindowListPage {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.period)) {
    throw new ApiError(502, "INVALID_DOWNTIME_WINDOW_PAGE", "Downtime window page is malformed");
  }
  const items = value.items.map((entry) => {
    if (!isRecord(entry))
      throw new ApiError(502, "INVALID_DOWNTIME_WINDOW_PAGE", "Downtime window item is malformed");
    for (const key of [
      "id",
      "serviceId",
      "startsAt",
      "endsAt",
      "message",
      "createdAt",
      "updatedAt",
    ]) {
      if (typeof entry[key] !== "string" || entry[key].length === 0) {
        throw new ApiError(
          502,
          "INVALID_DOWNTIME_WINDOW_PAGE",
          `Downtime window item is missing ${key}`,
        );
      }
    }
    if (!["ACTIVE", "UPCOMING", "EXPIRED"].includes(String(entry.phase))) {
      throw new ApiError(502, "INVALID_DOWNTIME_WINDOW_PAGE", "Downtime window phase is invalid");
    }
    if (
      typeof entry.isActive !== "boolean" ||
      typeof entry.isUpcoming !== "boolean" ||
      typeof entry.isExpired !== "boolean"
    ) {
      throw new ApiError(502, "INVALID_DOWNTIME_WINDOW_PAGE", "Downtime window flags are invalid");
    }
    return entry as DowntimeWindowResponse;
  });
  const total = value.total;
  const take = value.take;
  const cursor = value.cursor;
  const nextCursor = value.nextCursor;
  const hasMore = value.hasMore;
  const from = value.period.from;
  const to = value.period.to;
  if (
    typeof total !== "number" ||
    !Number.isInteger(total) ||
    total < 0 ||
    typeof take !== "number" ||
    !Number.isInteger(take) ||
    take < 1 ||
    take > 100 ||
    (typeof cursor !== "string" && cursor !== null) ||
    (typeof nextCursor !== "string" && nextCursor !== null) ||
    typeof hasMore !== "boolean" ||
    hasMore !== (nextCursor !== null) ||
    items.length > take ||
    typeof from !== "string" ||
    typeof to !== "string"
  ) {
    throw new ApiError(
      502,
      "INVALID_DOWNTIME_WINDOW_PAGE",
      "Downtime window page metadata is invalid",
    );
  }
  return { items, total, take, cursor, nextCursor, hasMore, period: { from, to } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    reason !== undefined && reason.length > 0 ? `?reason=${encodeURIComponent(reason)}` : "";
  return apiRequest(`/services/${serviceId}/downtime-windows/${downtimeWindowId}${query}`, {
    method: "DELETE",
  });
}

export function countUpcomingDowntimeWindows(windows: readonly DowntimeWindowResponse[]): number {
  return windows.filter((window) => window.phase === "UPCOMING").length;
}

export function listManagedDowntimeWindows(
  windows: readonly DowntimeWindowResponse[],
): readonly DowntimeWindowResponse[] {
  return windows.filter((window) => window.phase === "ACTIVE" || window.phase === "UPCOMING");
}
