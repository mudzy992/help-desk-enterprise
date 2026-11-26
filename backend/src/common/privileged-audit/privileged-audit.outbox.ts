import { randomUUID } from 'node:crypto';
import type { JsonValue } from '../../modules/change-log/change-log.types';
import type { RecordAuditEntryInput } from '../../modules/audit-log/audit-log.types';

/*
  W2.24 (`BA-security-03`): durable pending trail for privileged authentication
  events.

  The audit table lives in the same PostgreSQL as everything else, so "audit
  storage is down" almost never means the whole database is down: it means the
  chained append failed — a partition/lock problem, a policy rejection, a
  transient connection error on one statement. Until now every one of those was
  swallowed by `try { … } catch { /* ignore *\/ }` in the rate-limit, bulk-reset
  and account-security paths, so a forensic record of a critical change could
  disappear exactly when it mattered.

  The intent is written into the existing transactional outbox (its own table,
  its own claim/lease/retry/dead-letter protocol, no new schema) and the audit
  entry itself is produced by a delivery that commits the entry **and** the
  `SUCCEEDED` mark in one transaction. Consequences, documented in
  `docs/backend/implementation/358-w224-ba-security-03-privileged-audit-outbox.md`:

  * the event survives an audit-storage outage — it stays pending, not lost;
  * after recovery exactly one audit entry exists per intent, because the entry
    and the completion are the same commit (a crash rolls both back);
  * repeated calls with the same dedupe key collapse into one intent;
  * pending and dead-lettered intents are visible to operators (`health()` and
    `GET /security/metrics/privileged-audit`), and a dead letter is a warning
    line in the log, not silence.
*/

/** Outbox topic for privileged audit intents. */
export const privilegedAuditTopic = 'audit.privileged';

/** Delivery attempts before an intent is dead-lettered for an operator. */
export const privilegedAuditMaxAttempts = 20;

/** An intent older than this makes `health()` report `degraded`. */
export const privilegedAuditPendingWarningMs = 5 * 60_000;

/** Hydrated intent: exactly the fields `recordAuditEntry` needs. */
export type PrivilegedAuditIntent = {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorUserId: string | null;
  readonly metadata: JsonValue;
  readonly requestId?: string | null;
  readonly organizationalUnitId?: string | null;
};

export type PrivilegedAuditRecordInput = PrivilegedAuditIntent & {
  /**
   * Stable identity of the event. Two calls with the same key are one event —
   * use it for "this transition happened" semantics; omit it for events that are
   * unique by nature (a run, a change) and a key is generated.
   */
  readonly dedupeKey?: string;
};

export type PrivilegedAuditDeliveryOutcome = 'delivered' | 'pending' | 'unavailable';

const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;

/** `action:entityId:uuid` — unique per event, still a legal outbox key. */
export function defaultPrivilegedAuditKey(input: {
  readonly action: string;
  readonly entityId: string;
}): string {
  return `${input.action}:${input.entityId}:${randomUUID()}`.slice(0, 160);
}

export function isPrivilegedAuditKey(value: string): boolean {
  return keyPattern.test(value);
}

/** The outbox payload — a plain JSON object, so it survives a restart. */
export function toPrivilegedAuditPayload(input: PrivilegedAuditIntent): JsonValue {
  return {
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    metadata: input.metadata,
    requestId: input.requestId ?? null,
    organizationalUnitId: input.organizationalUnitId ?? null,
  };
}

/**
 * Reads an intent back from the outbox. A malformed payload is a permanent
 * error (the row will dead-letter after the configured attempts rather than be
 * silently dropped) — but it must never be interpreted loosely.
 */
export function readPrivilegedAuditPayload(payload: JsonValue): PrivilegedAuditIntent {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('PRIVILEGED_AUDIT_PAYLOAD_INVALID');
  }
  const candidate = payload as Record<string, JsonValue | undefined>;
  const action = candidate.action;
  const entityType = candidate.entityType;
  const entityId = candidate.entityId;
  if (typeof action !== 'string' || action.length === 0) {
    throw new Error('PRIVILEGED_AUDIT_PAYLOAD_INVALID');
  }
  if (typeof entityType !== 'string' || entityType.length === 0) {
    throw new Error('PRIVILEGED_AUDIT_PAYLOAD_INVALID');
  }
  if (typeof entityId !== 'string' || entityId.length === 0) {
    throw new Error('PRIVILEGED_AUDIT_PAYLOAD_INVALID');
  }
  const actorUserId = candidate.actorUserId ?? null;
  if (actorUserId !== null && typeof actorUserId !== 'string') {
    throw new Error('PRIVILEGED_AUDIT_PAYLOAD_INVALID');
  }
  const metadata = candidate.metadata;
  if (metadata === undefined) {
    throw new Error('PRIVILEGED_AUDIT_PAYLOAD_INVALID');
  }
  const requestId = candidate.requestId ?? null;
  const organizationalUnitId = candidate.organizationalUnitId ?? null;
  return {
    action,
    entityType,
    entityId,
    actorUserId,
    metadata,
    requestId: typeof requestId === 'string' ? requestId : null,
    organizationalUnitId: typeof organizationalUnitId === 'string' ? organizationalUnitId : null,
  };
}

/** The `recordAuditEntry` input for one intent (no runtime coercion). */
export function toAuditEntryInput(intent: PrivilegedAuditIntent): RecordAuditEntryInput {
  return {
    action: intent.action,
    entityType: intent.entityType,
    entityId: intent.entityId,
    actorUserId: intent.actorUserId,
    metadata: intent.metadata,
    requestId: intent.requestId ?? null,
    organizationalUnitId: intent.organizationalUnitId ?? null,
  };
}
