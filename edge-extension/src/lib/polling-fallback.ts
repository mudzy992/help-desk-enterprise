import { helpdeskRequest } from './helpdesk-http';

/**
 * Polling fallback za MV3.
 *
 * `setInterval` unutar service workera umire kad se SW suspenduje, pa je sav
 * periodički rad na `chrome.alarms` (jedini MV3-siguran scheduler). Period je
 * iz settingsa, clampovan na matricu (60–120 s, default 90).
 */
export const edgePollAlarmName = 'ep-helpdesk.poll.v1';

const minIntervalSeconds = 60;
const maxIntervalSeconds = 120;
const defaultIntervalSeconds = 90;

export type UnreadNotificationItem = {
  readonly id: string;
  readonly type: string;
  readonly ticketId: string | null;
  readonly payload?: { readonly ticketNumber?: string } | null;
};

export type UnreadNotificationsPage = {
  readonly items: readonly UnreadNotificationItem[];
  readonly unreadCount: number;
};

export function clampPollingIntervalSeconds(rawValue: number): number {
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return defaultIntervalSeconds;
  }
  return Math.min(
    maxIntervalSeconds,
    Math.max(minIntervalSeconds, Math.round(rawValue)),
  );
}

/** Idempotentno — ne diže dupli alarm. */
export async function ensurePollAlarm(intervalSeconds: number): Promise<void> {
  const periodInMinutes = clampPollingIntervalSeconds(intervalSeconds) / 60;
  const existing = await chrome.alarms.get(edgePollAlarmName);
  if (existing !== undefined && existing.periodInMinutes === periodInMinutes) {
    return;
  }
  await chrome.alarms.create(edgePollAlarmName, { periodInMinutes });
}

export async function clearPollAlarm(): Promise<void> {
  await chrome.alarms.clear(edgePollAlarmName);
}

export async function fetchUnreadNotifications(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
}): Promise<UnreadNotificationsPage> {
  const response = await helpdeskRequest<{
    readonly items?: readonly UnreadNotificationItem[];
    readonly unreadCount?: number;
  }>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: '/notifications?unreadOnly=true',
  });
  return {
    items: Array.isArray(response.items) ? response.items : [],
    unreadCount:
      typeof response.unreadCount === 'number' ? response.unreadCount : 0,
  };
}
