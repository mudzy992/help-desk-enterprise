/**
 * Paket 5.3.0 (D2): pure toast queue rules, kept free of React so they are
 * unit tested exhaustively (`toast-queue.spec.ts`).
 *
 * - The same message (tone + title + description) shown again does not stack a
 *   second card: it bumps `count` and restarts the timer of the existing one.
 * - At most `MAX_VISIBLE_TOASTS` are rendered; older ones wait in the queue and
 *   move up as soon as a visible one is dismissed (nothing is silently lost).
 * - Errors stay longer than confirmations; `duration: 0` keeps a toast until
 *   it is dismissed.
 */
export type ToastTone = "info" | "success" | "warning" | "danger";

export const MAX_VISIBLE_TOASTS = 3;

export const DEFAULT_TOAST_DURATION: Readonly<Record<ToastTone, number>> = {
  success: 5000,
  info: 5000,
  warning: 7000,
  // Constitution §32: an error must be readable — long enough to copy the request ID.
  danger: 10000,
};

export type ToastAction = {
  readonly label: string;
  readonly onClick: () => void;
};

export type ToastRecord = {
  readonly id: number;
  readonly tone: ToastTone;
  readonly title: string;
  readonly description?: string;
  readonly requestId?: string;
  readonly action?: ToastAction;
  readonly duration: number;
  /** How many times this exact message was raised while visible. */
  readonly count: number;
  /** Bumped on every duplicate so the timer restarts. */
  readonly revision: number;
};

export function toastFingerprint(record: Pick<ToastRecord, "tone" | "title" | "description">): string {
  return `${record.tone}\u0000${record.title}\u0000${record.description ?? ""}`;
}

/** Adds a toast or merges it into an identical one already queued. */
export function enqueueToast(
  queue: readonly ToastRecord[],
  incoming: Omit<ToastRecord, "count" | "revision">,
): { readonly queue: readonly ToastRecord[]; readonly id: number } {
  const fingerprint = toastFingerprint(incoming);
  const existing = queue.find((record) => toastFingerprint(record) === fingerprint);
  if (existing !== undefined) {
    return {
      id: existing.id,
      queue: queue.map((record) =>
        record.id === existing.id
          ? {
              ...record,
              // A newer request ID or action is the one worth showing.
              requestId: incoming.requestId ?? record.requestId,
              action: incoming.action ?? record.action,
              count: record.count + 1,
              revision: record.revision + 1,
            }
          : record,
      ),
    };
  }
  return { id: incoming.id, queue: [...queue, { ...incoming, count: 1, revision: 0 }] };
}

export function removeToast(queue: readonly ToastRecord[], id: number): readonly ToastRecord[] {
  return queue.filter((record) => record.id !== id);
}

/** The oldest `MAX_VISIBLE_TOASTS` records are on screen; the rest wait. */
export function visibleToasts(queue: readonly ToastRecord[]): readonly ToastRecord[] {
  return queue.slice(0, MAX_VISIBLE_TOASTS);
}

export function resolveToastDuration(tone: ToastTone, requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_TOAST_DURATION[tone];
  return requested <= 0 ? 0 : requested;
}
