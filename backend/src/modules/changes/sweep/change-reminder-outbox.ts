import type { Prisma } from "../../../generated/prisma/client";
import type { TransactionalOutboxService } from "../../../common/outbox/transactional-outbox.service";
import type { JsonValue } from "../../change-log/change-log.types";

/**
 * BA-changes-07 (W7.48): a reminder mark may only exist together with a
 * persisted, retryable delivery. The sweep claims the change and enqueues this
 * intent in the same transaction, so a failed delivery is retried by the outbox
 * instead of being lost while the mark says "sent".
 */
export const changeReminderDispatchTopic = "change.reminder.dispatch";
export const changeReminderDispatchMaxAttempts = 8;
/** A pending reminder older than this means the worker is not draining. */
export const changeReminderPendingWarningAgeMs = 15 * 60_000;

export type ChangeReminderKind = "starting_soon" | "overdue";

export type ChangeReminderPayload = Readonly<{
  changeId: string;
  kind: ChangeReminderKind;
  /** The window the notice belongs to; a moved window gets a new key. */
  occurrence: string;
}>;

export function changeReminderOccurrence(
  kind: ChangeReminderKind,
  facts: { readonly plannedStart: Date | null; readonly plannedEnd: Date | null },
): string {
  const instant = kind === "starting_soon" ? facts.plannedStart : facts.plannedEnd;
  if (instant === null) throw new Error("INVALID_CHANGE_REMINDER_OCCURRENCE");
  return `${kind === "starting_soon" ? "s" : "o"}${instant.getTime()}`;
}

export function changeReminderDedupeKey(
  changeId: string,
  kind: ChangeReminderKind,
  occurrence: string,
): string {
  return `change-reminder:${kind}:${changeId}:${occurrence}`;
}

export async function enqueueChangeReminder(
  outbox: TransactionalOutboxService,
  transaction: Prisma.TransactionClient,
  input: ChangeReminderPayload,
): Promise<{ readonly id: string; readonly created: boolean }> {
  const payload: JsonValue = {
    changeId: input.changeId,
    kind: input.kind,
    occurrence: input.occurrence,
  };
  return outbox.enqueue(transaction, {
    topic: changeReminderDispatchTopic,
    dedupeKey: changeReminderDedupeKey(input.changeId, input.kind, input.occurrence),
    payload,
    maxAttempts: changeReminderDispatchMaxAttempts,
  });
}

/** Fail-closed reader: a malformed row goes to the dead-letter queue, not to a wrong notice. */
export function readChangeReminderPayload(payload: unknown): ChangeReminderPayload {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    throw new Error("INVALID_CHANGE_REMINDER_PAYLOAD");
  const value = payload as Record<string, unknown>;
  if (
    typeof value.changeId !== "string" ||
    value.changeId.length === 0 ||
    value.changeId.length > 128
  ) {
    throw new Error("INVALID_CHANGE_REMINDER_PAYLOAD");
  }
  if (value.kind !== "starting_soon" && value.kind !== "overdue")
    throw new Error("INVALID_CHANGE_REMINDER_PAYLOAD");
  if (
    typeof value.occurrence !== "string" ||
    !/^[so]\d{1,16}$/u.test(value.occurrence)
  ) {
    throw new Error("INVALID_CHANGE_REMINDER_PAYLOAD");
  }
  return {
    changeId: value.changeId,
    kind: value.kind,
    occurrence: value.occurrence,
  };
}
