import type { TicketTimeLogResponse } from "@/services/tickets-collaboration-api";

/** Package 1.3 (T9): per-person totals for the ticket, largest first; deleted rows excluded. */
export function summarizeTimeByUser(
  items: readonly TicketTimeLogResponse[],
): readonly { readonly userId: string; readonly seconds: number }[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if ((item.deletedAt ?? null) !== null) continue;
    totals.set(item.userId, (totals.get(item.userId) ?? 0) + (item.durationSeconds ?? 0));
  }
  return [...totals.entries()]
    .map(([userId, seconds]) => ({ userId, seconds }))
    .sort((left, right) => right.seconds - left.seconds);
}

/** `datetime-local` value (local time, minutes) ↔ ISO. */
export function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
