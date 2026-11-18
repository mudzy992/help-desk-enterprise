import {
  dispatchProblemNotice,
  parseProblemNoticeIntent,
  problemNoticeDedupeKey,
  problemNoticeIntentOccurrence,
  problemNoticeMaxAttempts,
  problemNoticePayload,
  problemNoticeTopic,
  type ProblemNoticeIntentInput,
} from './problem-notice-outbox';
import {
  problemCreatedOccurrence,
  problemHandoffOccurrence,
  problemRecurrenceOccurrence,
  problemResolutionRunOccurrence,
  problemVersionOccurrence,
} from './problem-notice-occurrence';
import type { ProblemNotifier } from './problem-notifier';

const outboxKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;

function statusIntent(overrides: Partial<Extract<ProblemNoticeIntentInput, { kind: 'status-changed' }>> = {}) {
  return {
    kind: 'status-changed' as const,
    problemId: 'p1',
    status: 'RESOLVED',
    actorUserId: 'u1',
    occurrence: problemVersionOccurrence(4),
    ...overrides,
  };
}

describe('problem notice outbox identity', () => {
  it('keeps the topic acceptable for the shared outbox', () => {
    expect(problemNoticeTopic).toMatch(/^[a-z][a-z0-9._-]{2,99}$/u);
    expect(problemNoticeMaxAttempts).toBeGreaterThan(1);
  });

  it('derives a stable dedupe key from the occurrence, never from the clock', () => {
    const first = problemNoticeDedupeKey(statusIntent());
    expect(problemNoticeDedupeKey(statusIntent())).toBe(first);
    expect(first).toMatch(outboxKeyPattern);
    // A retried command (same version, same actor) is the same intent.
    expect(problemNoticeDedupeKey(statusIntent({ occurrence: problemVersionOccurrence(4) }))).toBe(first);
    // A different version, kind or actor is a different intent.
    expect(problemNoticeDedupeKey(statusIntent({ occurrence: problemVersionOccurrence(5) }))).not.toBe(first);
    expect(problemNoticeDedupeKey({ ...statusIntent(), kind: 'owner-assigned' })).not.toBe(first);
    expect(problemNoticeDedupeKey(statusIntent({ actorUserId: 'u2' }))).not.toBe(first);
  });

  it('keys a handoff notice by the handoff id it belongs to', () => {
    const requested = { kind: 'handoff-requested' as const, problemId: 'p1', handoffId: 'h1', targetGroupId: 'g2', actorUserId: 'u1' };
    const decided = { kind: 'handoff-decided' as const, problemId: 'p1', handoffId: 'h1', requesterUserId: 'u1', actorUserId: 'u1' };
    expect(problemNoticeIntentOccurrence(requested)).toEqual(problemHandoffOccurrence('h1'));
    expect(problemNoticeDedupeKey(requested)).toBe(problemNoticeDedupeKey(requested));
    expect(problemNoticeDedupeKey(requested)).not.toBe(problemNoticeDedupeKey(decided));
    expect(problemNoticeDedupeKey({ ...requested, handoffId: 'h2' })).not.toBe(problemNoticeDedupeKey(requested));
    for (const key of [problemNoticeDedupeKey(requested), problemNoticeDedupeKey(decided)]) {
      expect(key).toMatch(outboxKeyPattern);
    }
  });

  it('keeps every key inside the outbox limit even for a long resolution run', () => {
    const intent = statusIntent({
      problemId: '7f0d1c1e-0000-4000-8000-000000000000',
      occurrence: problemResolutionRunOccurrence('9a4d2b1c-1111-4222-8333-444455556666', 'RESOLVED'),
      actorUserId: 'f2f0f0f0-2222-4333-8444-555566667777',
    });
    const key = problemNoticeDedupeKey(intent);
    expect(key).toMatch(outboxKeyPattern);
    expect(key.length).toBeLessThanOrEqual(160);
  });
});

describe('problem notice outbox payload', () => {
  it('round-trips every intent kind', () => {
    const intents: ProblemNoticeIntentInput[] = [
      { kind: 'owner-assigned', problemId: 'p1', actorUserId: 'u1', occurrence: problemVersionOccurrence(2) },
      { kind: 'group-assigned', problemId: 'p1', actorUserId: null, occurrence: problemCreatedOccurrence },
      { kind: 'status-changed', problemId: 'p1', status: 'KNOWN_ERROR', actorUserId: 'u1', occurrence: problemVersionOccurrence(3) },
      { kind: 'recurrence', problemId: 'p1', actorUserId: 'u1', occurrence: problemRecurrenceOccurrence(['T-1', 'T-2']) },
      { kind: 'handoff-requested', problemId: 'p1', handoffId: 'h1', targetGroupId: 'g2', actorUserId: 'u1' },
      { kind: 'handoff-decided', problemId: 'p1', handoffId: 'h1', requesterUserId: null, actorUserId: 'u1' },
    ];
    for (const intent of intents) {
      // The handoff kinds carry no occurrence: it is derived from the handoff id.
      expect(parseProblemNoticeIntent(problemNoticePayload(intent))).toEqual(intent);
    }
  });

  it('carries identifiers only, never ticket numbers', () => {
    const payload = problemNoticePayload({
      kind: 'recurrence',
      problemId: 'p1',
      actorUserId: 'u1',
      occurrence: problemRecurrenceOccurrence(['SECRET-TICKET']),
    });
    expect(JSON.stringify(payload)).not.toContain('SECRET-TICKET');
  });

  it('rejects a payload it cannot read instead of delivering something else', () => {
    expect(() => parseProblemNoticeIntent(null)).toThrow(/INVALID_PROBLEM_NOTICE_PAYLOAD/u);
    expect(() => parseProblemNoticeIntent({ v: 2, kind: 'status-changed', problemId: 'p1' })).toThrow(/version/u);
    expect(() => parseProblemNoticeIntent({ v: 1, kind: 'unknown', problemId: 'p1' })).toThrow(/kind/u);
    expect(() => parseProblemNoticeIntent({ v: 1, kind: 'status-changed', problemId: 'p1', occurrence: 'v4' })).toThrow(/status/u);
    expect(() =>
      parseProblemNoticeIntent({ v: 1, kind: 'handoff-decided', problemId: 'p1', handoffId: 'h1', occurrence: 'handoff:h1' }),
    ).not.toThrow();
  });
});

describe('problem notice dispatch', () => {
  const notifier = {
    ownerAssigned: jest.fn(async () => 1),
    groupAssigned: jest.fn(async () => 1),
    statusChanged: jest.fn(async () => 1),
    recurrence: jest.fn(async () => 1),
    handoffRequested: jest.fn(async () => 1),
    handoffDecided: jest.fn(async () => 1),
  } as unknown as ProblemNotifier;

  beforeEach(() => jest.clearAllMocks());

  it.each([
    [{ kind: 'owner-assigned', problemId: 'p1', actorUserId: 'u1', occurrence: problemVersionOccurrence(2) }, 'ownerAssigned', ['p1', 'u1', problemVersionOccurrence(2)]],
    [{ kind: 'group-assigned', problemId: 'p1', actorUserId: 'u1', occurrence: problemCreatedOccurrence }, 'groupAssigned', ['p1', 'u1', problemCreatedOccurrence]],
    [{ kind: 'status-changed', problemId: 'p1', status: 'RESOLVED', actorUserId: 'u1', occurrence: problemVersionOccurrence(3) }, 'statusChanged', ['p1', 'RESOLVED', 'u1', problemVersionOccurrence(3)]],
    [{ kind: 'recurrence', problemId: 'p1', actorUserId: 'u1', occurrence: problemRecurrenceOccurrence(['T-1']) }, 'recurrence', ['p1', problemRecurrenceOccurrence(['T-1']), 'u1']],
    [{ kind: 'handoff-requested', problemId: 'p1', handoffId: 'h1', targetGroupId: 'g2', actorUserId: 'u1' }, 'handoffRequested', ['p1', 'h1', 'g2', 'u1']],
    [{ kind: 'handoff-decided', problemId: 'p1', handoffId: 'h1', requesterUserId: 'u2', actorUserId: 'u1' }, 'handoffDecided', ['p1', 'h1', 'u2', 'u1']],
  ] as const)('delivers %j through %s', async (intent, method, args) => {
    await dispatchProblemNotice(notifier, intent as ProblemNoticeIntentInput);
    expect((notifier as unknown as Record<string, jest.Mock>)[method]).toHaveBeenCalledWith(...args);
  });

  it('propagates a delivery failure so the outbox can retry the row', async () => {
    (notifier.statusChanged as jest.Mock).mockRejectedValueOnce(new Error('SMTP timeout'));
    await expect(dispatchProblemNotice(notifier, statusIntent())).rejects.toThrow('SMTP timeout');
  });
});
