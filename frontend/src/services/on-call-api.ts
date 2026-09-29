import { apiRequest } from "@/services/api";

/**
 * Paket 2.9 (K3): `/on-call/*`. Types mirror `backend/src/modules/on-call`.
 * Reading and swap requests need `oncall.read`; schedules and overrides
 * `oncall.manage`.
 */

export type OnCallPerson = {
  readonly userId: string;
  readonly displayName: string;
  readonly isAvailable: boolean;
};

export type OnCallSegmentView = {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly source: "rotation" | "override" | "none";
  readonly person: OnCallPerson | null;
};

export type OnCallOverviewGroup = {
  readonly groupId: string;
  readonly groupName: string;
  readonly hasSchedule: boolean;
  readonly isActive: boolean;
  readonly current: {
    readonly userId: string;
    readonly displayName: string;
    readonly source: "rotation" | "override" | "none";
    readonly endsAt: string;
  } | null;
};

export type OnCallOverview = {
  readonly canManage: boolean;
  readonly groups: readonly OnCallOverviewGroup[];
};

export type OnCallRotationLength = "DAY" | "WEEK";

export type OnCallScheduleView = {
  readonly id: string;
  readonly timezone: string;
  readonly handoffTime: string;
  readonly rotationLength: OnCallRotationLength;
  readonly rotationStartDate: string;
  readonly isActive: boolean;
  readonly autoAssignOutsideHours: boolean;
  readonly owner: OnCallPerson | null;
  readonly members: ReadonlyArray<OnCallPerson & { readonly position: number }>;
};

export type OnCallOverrideView = {
  readonly id: string;
  readonly person: OnCallPerson | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string;
  readonly fromSwap: boolean;
};

export type OnCallPendingSwapView = {
  readonly id: string;
  readonly requester: OnCallPerson | null;
  readonly colleague: OnCallPerson | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string;
};

export type OnCallGroupDetail = {
  readonly group: { readonly id: string; readonly name: string };
  readonly schedule: OnCallScheduleView | null;
  readonly segments: readonly OnCallSegmentView[];
  readonly current: OnCallSegmentView | null;
  readonly overrides: readonly OnCallOverrideView[];
  readonly swaps: readonly OnCallPendingSwapView[];
  readonly candidates: ReadonlyArray<{ readonly userId: string; readonly displayName: string }>;
  readonly defaultTimezone: string;
  readonly canManage: boolean;
};

export type OnCallMe = {
  readonly enabled: boolean;
  readonly current: ReadonlyArray<{ readonly groupId: string; readonly groupName: string; readonly endsAt: string }>;
  readonly next: {
    readonly groupId: string;
    readonly groupName: string;
    readonly startsAt: string;
    readonly endsAt: string;
  } | null;
};

export type OnCallSwapStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";

export type OnCallSwapView = {
  readonly id: string;
  readonly status: OnCallSwapStatus;
  readonly direction: "incoming" | "outgoing";
  readonly groupId: string;
  readonly groupName: string;
  readonly requester: { readonly userId: string; readonly displayName: string };
  readonly colleague: { readonly userId: string; readonly displayName: string };
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string;
  readonly decidedAt: string | null;
  readonly createdAt: string;
};

export type SaveOnCallScheduleInput = {
  readonly timezone: string;
  readonly handoffTime: string;
  readonly rotationLength: OnCallRotationLength;
  readonly rotationStartDate: string;
  readonly isActive: boolean;
  readonly autoAssignOutsideHours: boolean;
  readonly ownerUserId: string | null;
  readonly memberUserIds: readonly string[];
  readonly reason: string;
};

const id = (value: string) => encodeURIComponent(value);
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function getOnCallOverview(): Promise<OnCallOverview> {
  return apiRequest("/on-call/overview");
}
export function getOnCallMe(): Promise<OnCallMe> {
  return apiRequest("/on-call/me");
}
export function getOnCallGroup(groupId: string, range: { readonly from: string; readonly to: string }): Promise<OnCallGroupDetail> {
  const query = new URLSearchParams(range).toString();
  return apiRequest(`/on-call/groups/${id(groupId)}?${query}`);
}
export function saveOnCallSchedule(groupId: string, input: SaveOnCallScheduleInput): Promise<{ readonly id: string }> {
  return apiRequest(`/on-call/groups/${id(groupId)}`, json("PUT", input));
}
export function deleteOnCallSchedule(groupId: string, reason: string): Promise<void> {
  return apiRequest(`/on-call/groups/${id(groupId)}`, json("DELETE", { reason }));
}
export function createOnCallOverride(
  groupId: string,
  input: { readonly userId: string; readonly startsAt: string; readonly endsAt: string; readonly reason: string },
): Promise<{ readonly id: string }> {
  return apiRequest(`/on-call/groups/${id(groupId)}/overrides`, json("POST", input));
}
export function deleteOnCallOverride(overrideId: string, reason: string): Promise<void> {
  return apiRequest(`/on-call/overrides/${id(overrideId)}`, json("DELETE", { reason }));
}
export function requestOnCallSwap(
  groupId: string,
  input: { readonly colleagueId: string; readonly startsAt: string; readonly endsAt: string; readonly reason: string },
): Promise<{ readonly id: string }> {
  return apiRequest(`/on-call/groups/${id(groupId)}/swaps`, json("POST", input));
}
export function listOnCallSwaps(): Promise<{ readonly swaps: readonly OnCallSwapView[] }> {
  return apiRequest("/on-call/swaps");
}
export function decideOnCallSwap(swapId: string, decision: "accept" | "decline" | "cancel"): Promise<void> {
  return apiRequest(`/on-call/swaps/${id(swapId)}/${decision}`, json("POST"));
}
export function getOnCallCalendarToken(): Promise<{ readonly exists: boolean; readonly createdAt: string | null }> {
  return apiRequest("/on-call/calendar-token");
}
export function rotateOnCallCalendarToken(): Promise<{ readonly token: string }> {
  return apiRequest("/on-call/calendar-token", json("POST"));
}
export function revokeOnCallCalendarToken(): Promise<void> {
  return apiRequest("/on-call/calendar-token", json("DELETE"));
}

/** Absolute subscription URL (calendar clients need the full address). */
export function onCallCalendarUrl(token: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
  const absolute = /^https?:\/\//.test(base) ? base : `${window.location.origin}${base}`;
  return `${absolute}/public/on-call/calendar.ics?token=${encodeURIComponent(token)}`;
}
