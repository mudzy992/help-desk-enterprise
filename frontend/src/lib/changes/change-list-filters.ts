import { changeOpenStatuses, changeStatuses, type ChangeStatus } from "@/services/changes-api";

export type ChangeStatusFilter = "open" | "all" | ChangeStatus;

export function changeStatusesOf(filter: ChangeStatusFilter): readonly ChangeStatus[] | undefined {
  if (filter === "all") return undefined;
  if (filter === "open") return changeOpenStatuses;
  return [filter];
}

export function parseChangeStatusFilter(raw: string | null): ChangeStatusFilter {
  if (raw === "all") return "all";
  return raw !== null && (changeStatuses as readonly string[]).includes(raw)
    ? (raw as ChangeStatus)
    : "open";
}

export function parseChangeFilterValue<T extends string>(
  raw: string | null,
  values: readonly T[],
): T | "" {
  return raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : "";
}
