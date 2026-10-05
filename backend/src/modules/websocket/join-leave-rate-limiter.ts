/**
 * Val 3 (M11/B2): `ticket:join` and `ticket:leave` each run a full authorization
 * pass (`loadAccessibleTicket` + access policies, at least one or two database
 * queries), while `presence` was already limited to 30 messages per socket per
 * minute. The same window now covers join/leave, so an authenticated user — or a
 * broken client in a loop — cannot turn one socket into an unlimited stream of
 * authorization queries.
 *
 * The window lives on `socket.data` (one object per socket, no global map), so it
 * disappears with the connection and there is nothing to evict. Rejections are
 * counted in the same object so the gateway can log a real counter instead of a
 * bare "denied" line.
 */
export const joinLeaveRateLimit = { maxMessagesPerMinute: 30 } as const;

export type JoinLeaveWindow = {
  start: number;
  count: number;
  rejections: number;
};

export function allowJoinLeaveMessage(
  data: { joinLeaveWindow?: JoinLeaveWindow },
  now: number = Date.now(),
): boolean {
  const window = data.joinLeaveWindow;
  if (window === undefined || now - window.start >= 60_000) {
    data.joinLeaveWindow = { start: now, count: 1, rejections: 0 };
    return true;
  }
  if (window.count >= joinLeaveRateLimit.maxMessagesPerMinute) {
    window.rejections += 1;
    return false;
  }
  window.count += 1;
  return true;
}

/** Rejections inside the current window, for the log line the gateway writes. */
export function countJoinLeaveRejections(data: {
  joinLeaveWindow?: JoinLeaveWindow;
}): number {
  return data.joinLeaveWindow?.rejections ?? 0;
}
