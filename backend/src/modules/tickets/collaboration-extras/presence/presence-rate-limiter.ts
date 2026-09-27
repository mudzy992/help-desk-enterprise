import { presenceTiming } from './ticket-presence.types';

/** Paket 2.4 (A5): at most 30 presence messages per socket per minute; the rest are ignored. */
export function allowPresenceMessage(
  data: { presenceWindow?: { start: number; count: number } },
  now: number = Date.now(),
): boolean {
  const window = data.presenceWindow;
  if (window === undefined || now - window.start >= 60_000) {
    data.presenceWindow = { start: now, count: 1 };
    return true;
  }
  if (window.count >= presenceTiming.maxMessagesPerMinute) {
    return false;
  }
  window.count += 1;
  return true;
}
