import type { Prisma } from "../../generated/prisma/client";
import type { TransactionalOutboxService } from "../../common/outbox/transactional-outbox.service";
import type { JsonValue } from "../change-log/change-log.types";

export const changeDowntimeSyncTopic = "change.downtime.sync";
export const changeDowntimeSyncMaxAttempts = 10;
export const changeDowntimePendingWarningAgeMs = 5 * 60_000;

export type ChangeDowntimeSyncPayload = Readonly<{
  changeId: string;
  actorUserId: string | null;
}>;

export function changeDowntimeVersionDedupeKey(
  changeId: string,
  version: number,
): string {
  return `change:${changeId}:v${version}`;
}

export function changeDowntimeReconciliationDedupeKey(
  changeId: string,
  bucket: number,
): string {
  return `reconcile:${changeId}:${bucket}`;
}

/**
 * Records the recomputable desired-state command in the same transaction as
 * the change lifecycle/version update. The worker always reads the latest
 * change row, so delayed or duplicate commands converge on current state.
 */
export async function enqueueChangeDowntimeSync(
  outbox: TransactionalOutboxService,
  transaction: Prisma.TransactionClient,
  input: ChangeDowntimeSyncPayload & { readonly version: number },
): Promise<{ readonly id: string; readonly created: boolean }> {
  if (!Number.isInteger(input.version) || input.version < 1)
    throw new Error("INVALID_CHANGE_DOWNTIME_VERSION");
  const payload: JsonValue = {
    changeId: input.changeId,
    actorUserId: input.actorUserId,
  };
  return outbox.enqueue(transaction, {
    topic: changeDowntimeSyncTopic,
    dedupeKey: changeDowntimeVersionDedupeKey(input.changeId, input.version),
    payload,
    maxAttempts: changeDowntimeSyncMaxAttempts,
  });
}

export function readChangeDowntimeSyncPayload(
  payload: unknown,
): ChangeDowntimeSyncPayload {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    throw new Error("INVALID_CHANGE_DOWNTIME_PAYLOAD");
  const value = payload as Record<string, unknown>;
  if (
    typeof value.changeId !== "string" ||
    value.changeId.length === 0 ||
    value.changeId.length > 128
  ) {
    throw new Error("INVALID_CHANGE_DOWNTIME_PAYLOAD");
  }
  if (
    value.actorUserId !== null &&
    (typeof value.actorUserId !== "string" ||
      value.actorUserId.length === 0 ||
      value.actorUserId.length > 128)
  ) {
    throw new Error("INVALID_CHANGE_DOWNTIME_PAYLOAD");
  }
  return {
    changeId: value.changeId,
    actorUserId: value.actorUserId as string | null,
  };
}
