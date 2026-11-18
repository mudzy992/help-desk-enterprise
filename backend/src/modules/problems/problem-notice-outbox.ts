import { createHash } from 'node:crypto';
import type { ProblemNotifier } from './problem-notifier';
import {
  problemHandoffOccurrence,
  type ProblemNoticeOccurrence,
} from './problem-notice-occurrence';
import type { JsonValue } from '../change-log/change-log.types';

/**
 * W7.42 (BA-problems-21): a problem notice is an intent before it is a message.
 *
 * Until now `ProblemNotifier.run()` fired the delivery and forgot about it: a
 * failed SMTP handshake or a database hiccup lost the notification, and nothing
 * remembered that it had been owed. The intent is now written to the shared
 * `OutboxMessage` table inside the same transaction as the problem write (or
 * immediately after the sub-step that owns it), and the worker delivers it with
 * retries, backoff and a dead-letter state.
 *
 * Properties this keeps from W7.31:
 * - the dedupe key is derived from the occurrence of the change, never from the
 *   clock, so a retried command or a replayed outbox row converges on one notice;
 * - the notifier still dedupes per recipient (`problem:<type>:<id>:<occurrence>:<userId>`),
 *   so a second delivery attempt after a partial success reaches only the users
 *   who did not get the message yet.
 *
 * No migration: the outbox table already exists (BA-integration-queue).
 */
export const problemNoticeTopic = 'problem.notice.dispatch';

/**
 * Eight attempts with the shared exponential backoff (1 s … 128 s, capped at an
 * hour) span roughly half a day of retries — long enough for an SMTP outage,
 * short enough that a broken row reaches the dead-letter state the same day.
 */
export const problemNoticeMaxAttempts = 8;

export type ProblemNoticeIntentInput =
  | Readonly<{
      kind: 'owner-assigned';
      problemId: string;
      actorUserId: string | null;
      occurrence: ProblemNoticeOccurrence;
    }>
  | Readonly<{
      kind: 'group-assigned';
      problemId: string;
      actorUserId: string | null;
      occurrence: ProblemNoticeOccurrence;
    }>
  | Readonly<{
      kind: 'status-changed';
      problemId: string;
      status: string;
      actorUserId: string | null;
      occurrence: ProblemNoticeOccurrence;
    }>
  | Readonly<{
      kind: 'recurrence';
      problemId: string;
      actorUserId: string | null;
      occurrence: ProblemNoticeOccurrence;
    }>
  | Readonly<{
      kind: 'handoff-requested';
      problemId: string;
      handoffId: string;
      targetGroupId: string;
      actorUserId: string | null;
    }>
  | Readonly<{
      kind: 'handoff-decided';
      problemId: string;
      handoffId: string;
      requesterUserId: string | null;
      actorUserId: string | null;
    }>;

export type ProblemNoticeIntent = ProblemNoticeIntentInput;

/** The occurrence that identifies the announced change (W7.31 identity). */
export function problemNoticeIntentOccurrence(
  intent: ProblemNoticeIntentInput,
): ProblemNoticeOccurrence {
  switch (intent.kind) {
    case 'handoff-requested':
    case 'handoff-decided':
      return problemHandoffOccurrence(intent.handoffId);
    default:
      return intent.occurrence;
  }
}

/**
 * `problem-notice:<kind>:<problemId>:<occurrence>:a<actor digest>` — one row per
 * announced change *and* per actor. The outbox unique constraint
 * `(topic, dedupeKey)` therefore makes a repeated command a no-op instead of a
 * second message, which is the guarantee W7.31 established one layer higher.
 *
 * The actor is part of the key for two reasons: the notifier excludes the actor
 * from the recipients, so the payload depends on it, and a resumed resolution
 * run is executed by a different manager while keeping the run occurrence — that
 * second command must be able to queue a notice for the agents the first one did
 * not reach, while the notifier's per-user dedupe still keeps them from hearing
 * about it twice.
 */
export function problemNoticeDedupeKey(intent: ProblemNoticeIntentInput): string {
  const actor = createHash('sha256')
    .update(intent.actorUserId ?? 'system')
    .digest('hex')
    .slice(0, 12);
  return `problem-notice:${intent.kind}:${intent.problemId}:${problemNoticeIntentOccurrence(intent).key}:a${actor}`;
}

/** JSON payload stored in the outbox row; identifiers only, never content. */
export function problemNoticePayload(intent: ProblemNoticeIntentInput): JsonValue {
  const occurrence = problemNoticeIntentOccurrence(intent).key;
  switch (intent.kind) {
    case 'status-changed':
      return {
        v: 1,
        kind: intent.kind,
        problemId: intent.problemId,
        actorUserId: intent.actorUserId,
        occurrence,
        status: intent.status,
      };
    case 'handoff-requested':
      return {
        v: 1,
        kind: intent.kind,
        problemId: intent.problemId,
        actorUserId: intent.actorUserId,
        occurrence,
        handoffId: intent.handoffId,
        targetGroupId: intent.targetGroupId,
      };
    case 'handoff-decided':
      return {
        v: 1,
        kind: intent.kind,
        problemId: intent.problemId,
        actorUserId: intent.actorUserId,
        occurrence,
        handoffId: intent.handoffId,
        requesterUserId: intent.requesterUserId,
      };
    default:
      return { v: 1, kind: intent.kind, problemId: intent.problemId, actorUserId: intent.actorUserId, occurrence };
  }
}

function invalid(reason: string): Error {
  return new Error(`INVALID_PROBLEM_NOTICE_PAYLOAD:${reason}`);
}

function readString(value: Record<string, unknown>, field: string): string {
  const read = value[field];
  if (typeof read !== 'string' || read.length === 0) throw invalid(field);
  return read;
}

function readNullableString(value: Record<string, unknown>, field: string): string | null {
  const read = value[field];
  if (read === null || read === undefined) return null;
  if (typeof read !== 'string') throw invalid(field);
  return read.length === 0 ? null : read;
}

function occurrenceOf(value: Record<string, unknown>): ProblemNoticeOccurrence {
  const key = readString(value, 'occurrence');
  return Object.freeze({ key });
}

/**
 * A payload the worker cannot read is a programming error, not a transient one;
 * it throws so the row fails visibly and ends in the dead-letter state instead
 * of being delivered with guessed arguments.
 */
export function parseProblemNoticeIntent(payload: unknown): ProblemNoticeIntent {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw invalid('shape');
  const value = payload as Record<string, unknown>;
  if (value.v !== 1) throw invalid('version');
  if (typeof value.kind !== 'string') throw invalid('kind');
  const problemId = readString(value, 'problemId');
  const actorUserId = readNullableString(value, 'actorUserId');
  switch (value.kind) {
    case 'owner-assigned':
    case 'group-assigned':
      return { kind: value.kind, problemId, actorUserId, occurrence: occurrenceOf(value) };
    case 'recurrence':
      return { kind: value.kind, problemId, actorUserId, occurrence: occurrenceOf(value) };
    case 'status-changed':
      return {
        kind: value.kind,
        problemId,
        actorUserId,
        occurrence: occurrenceOf(value),
        status: readString(value, 'status'),
      };
    case 'handoff-requested':
      return {
        kind: value.kind,
        problemId,
        actorUserId,
        handoffId: readString(value, 'handoffId'),
        targetGroupId: readString(value, 'targetGroupId'),
      };
    case 'handoff-decided':
      return {
        kind: value.kind,
        problemId,
        actorUserId,
        handoffId: readString(value, 'handoffId'),
        requesterUserId: readNullableString(value, 'requesterUserId'),
      };
    default:
      throw invalid('kind');
  }
}

/**
 * The delivery itself. The notifier re-reads the problem and its recipients, so
 * a retry minutes later still reaches the right people, while the occurrence in
 * the payload keeps the per-user dedupe stable across attempts.
 */
export async function dispatchProblemNotice(
  notifier: ProblemNotifier,
  intent: ProblemNoticeIntent,
): Promise<void> {
  switch (intent.kind) {
    case 'owner-assigned':
      await notifier.ownerAssigned(intent.problemId, intent.actorUserId, intent.occurrence);
      return;
    case 'group-assigned':
      await notifier.groupAssigned(intent.problemId, intent.actorUserId, intent.occurrence);
      return;
    case 'status-changed':
      await notifier.statusChanged(intent.problemId, intent.status, intent.actorUserId, intent.occurrence);
      return;
    case 'recurrence':
      await notifier.recurrence(intent.problemId, intent.occurrence, intent.actorUserId);
      return;
    case 'handoff-requested':
      await notifier.handoffRequested(intent.problemId, intent.handoffId, intent.targetGroupId, intent.actorUserId);
      return;
    case 'handoff-decided':
      await notifier.handoffDecided(intent.problemId, intent.handoffId, intent.requesterUserId, intent.actorUserId);
      return;
  }
}
