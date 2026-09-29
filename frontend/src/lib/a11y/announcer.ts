/**
 * Global screen-reader announcer (2.8 §3.4).
 *
 * One pair of live regions lives in the application shell; every component
 * announces through this module instead of rendering its own aria-live region.
 * Identical messages (same dedupe key) are throttled so realtime bursts do not
 * flood the screen reader.
 */
export type AnnouncePoliteness = "polite" | "assertive";

export interface AnnounceOptions {
  readonly politeness?: AnnouncePoliteness;
  /** Messages sharing a key are throttled together; defaults to the message itself. */
  readonly dedupeKey?: string;
  readonly throttleMs?: number;
}

export interface Announcement {
  readonly id: number;
  readonly message: string;
  readonly politeness: AnnouncePoliteness;
}

type Listener = (announcement: Announcement) => void;

export const DEFAULT_ANNOUNCE_THROTTLE_MS = 3_000;
const MAX_TRACKED_KEYS = 200;

const listeners = new Set<Listener>();
const lastAnnouncedAt = new Map<string, number>();
let sequence = 0;
let clock: () => number = () => Date.now();

export function announce(message: string, options: AnnounceOptions = {}): boolean {
  const text = message.trim();
  if (text.length === 0) {
    return false;
  }
  const key = options.dedupeKey ?? text;
  const throttleMs = options.throttleMs ?? DEFAULT_ANNOUNCE_THROTTLE_MS;
  const now = clock();
  const previous = lastAnnouncedAt.get(key);
  if (previous !== undefined && now - previous < throttleMs) {
    return false;
  }
  if (lastAnnouncedAt.size >= MAX_TRACKED_KEYS) {
    lastAnnouncedAt.clear();
  }
  lastAnnouncedAt.set(key, now);
  sequence += 1;
  const announcement: Announcement = {
    id: sequence,
    message: text,
    politeness: options.politeness ?? "polite",
  };
  for (const listener of listeners) {
    listener(announcement);
  }
  return true;
}

export function subscribeToAnnouncements(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam. */
export function resetAnnouncerForTests(now?: () => number): void {
  listeners.clear();
  lastAnnouncedAt.clear();
  sequence = 0;
  clock = now ?? (() => Date.now());
}
