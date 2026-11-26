import type { JsonValue } from '../../modules/change-log/change-log.types';
import {
  defaultPrivilegedAuditKey,
  isPrivilegedAuditKey,
  privilegedAuditMaxAttempts,
  privilegedAuditPendingWarningMs,
  privilegedAuditTopic,
  readPrivilegedAuditPayload,
  toPrivilegedAuditPayload,
} from './privileged-audit.outbox';
import { PrivilegedAuditService } from './privileged-audit.service';

/*
  W2.24 (`BA-security-03`): the contract of the durable privileged-audit writer,
  pinned without a database. The acceptance in `docs/backend/audits/09-security.md`
  is one sentence — an audit outage must not lose the event, and after recovery
  there is exactly one correlated entry — so this spec proves the *decisions* the
  service makes (which outcome it reports, what it parks, when it says `degraded`),
  and the PostgreSQL spec proves the resulting rows.

  The properties that matter here:
    * `record` never throws: a privileged action is not failed by an audit problem;
    * it does not lie either — `delivered` only when the entry really landed,
      `pending` when the intent survives for replay, `unavailable` when even the
      intent could not be stored (the only case that is a genuine gap);
    * one dedupe key is one event: two calls with the same key are one intent;
    * a dead letter or a stale pending intent makes `health()` say `degraded`.
*/

type DispatchResult = 'idle' | 'succeeded' | 'retry' | 'dead-letter';

type StoredIntent = { dedupeKey: string; payload: JsonValue; status: string; createdAt: Date };

function harness(options: { enqueueFails?: boolean; stale?: boolean; deadLetter?: number } = {}) {
  const intents = new Map<string, StoredIntent>();
  const enqueued: { topic: string; dedupeKey: string; payload: JsonValue; maxAttempts?: number }[] = [];

  const transactionClient = {
    outboxMessage: {
      create: jest.fn(async () => ({})),
    },
  };

  const prisma = {
    $transaction: async (run: (client: unknown) => Promise<unknown>) => run(transactionClient),
    outboxMessage: {
      findUnique: jest.fn(async ({ where }: { where: { topic_dedupeKey: { dedupeKey: string } } }) => {
        const row = intents.get(where.topic_dedupeKey.dedupeKey);
        return row === undefined ? null : { status: row.status };
      }),
      count: jest.fn(async ({ where }: { where: { status: string } }) => {
        if (where.status === 'DEAD_LETTER') return options.deadLetter ?? 0;
        const statuses = Array.from(intents.values()).filter((row) => row.status === where.status);
        return where.status === 'PENDING'
          ? statuses.length + (options.stale === true ? 0 : 0)
          : statuses.length;
      }),
      findFirst: jest.fn(async ({ where }: { where: { status: { in: string[] } } }) => {
        const rows = Array.from(intents.values()).filter((row) => where.status.in.includes(row.status));
        if (rows.length === 0) return null;
        const oldest = rows.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
        return { createdAt: oldest.createdAt };
      }),
    },
  };

  const outbox = {
    enqueue: jest.fn(
      async (
        _transaction: unknown,
        input: { topic: string; dedupeKey: string; payload: JsonValue; maxAttempts?: number },
      ) => {
        if (options.enqueueFails === true) throw new Error('database is down');
        enqueued.push(input);
        // Same key = same event: the real outbox answers `created: false` and the
        // existing row stays as it is.
        if (!intents.has(input.dedupeKey)) {
          intents.set(input.dedupeKey, {
            dedupeKey: input.dedupeKey,
            payload: input.payload,
            status: 'PENDING',
            createdAt: new Date(Date.now() - (options.stale === true ? privilegedAuditPendingWarningMs + 60_000 : 0)),
          });
        }
        return { id: input.dedupeKey, created: !enqueued.slice(0, -1).some((row) => row.dedupeKey === input.dedupeKey) };
      },
    ),
    dispatchOneTransactionally: jest.fn<Promise<DispatchResult>, unknown[]>(async () => 'idle'),
  };

  const service = new PrivilegedAuditService(prisma as never, outbox as never);
  return { service, prisma, outbox, intents, enqueued, transactionClient };
}

const input = {
  action: 'auth.rate_limits_changed',
  entityType: 'user',
  entityId: 'admin-1',
  actorUserId: 'admin-1',
  metadata: { ipMaxFailures: 40 } as JsonValue,
};

describe('PrivilegedAuditService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports delivered only after the delivery committed the entry', async () => {
    const { service, outbox, intents } = harness();
    outbox.dispatchOneTransactionally.mockImplementation(async () => {
      const stored = Array.from(intents.values()).at(-1);
      if (stored !== undefined) stored.status = 'SUCCEEDED';
      return 'succeeded';
    });

    await expect(service.record({ ...input, dedupeKey: 'rate_limits:admin-1:v1' })).resolves.toBe('delivered');
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue.mock.calls[0]![1]).toMatchObject({
      topic: privilegedAuditTopic,
      dedupeKey: 'rate_limits:admin-1:v1',
      maxAttempts: privilegedAuditMaxAttempts,
    });
  });

  it('reports pending when the delivery did not run, and keeps the intent', async () => {
    const { service, intents } = harness();
    await expect(service.record({ ...input, dedupeKey: 'rate_limits:admin-1:v2' })).resolves.toBe('pending');
    expect(intents.get('rate_limits:admin-1:v2')).toMatchObject({ status: 'PENDING' });
  });

  it('reports unavailable and does not throw when even the intent cannot be stored', async () => {
    const { service } = harness({ enqueueFails: true });
    await expect(service.record({ ...input, dedupeKey: 'rate_limits:admin-1:v3' })).resolves.toBe('unavailable');
  });

  it('never fails the caller: a rejected outbox call is an outcome, not an exception', async () => {
    const { service, prisma } = harness();
    prisma.$transaction = jest.fn(async () => {
      throw new Error('connection terminated');
    }) as never;
    await expect(service.record(input)).resolves.toBe('unavailable');
  });

  /*
    Regression from the first CI run: a caller that injects a *partial* client (a
    fault-injection proxy, a worker boot) made the status read throw out of
    `record` and turned a privileged action into a 500. `record` is a boundary:
    an unreadable status is `pending`, not an exception.
  */
  it('answers pending instead of throwing when the delivery or the status read fails', async () => {
    const broken = harness();
    broken.prisma.outboxMessage.findUnique = jest.fn(async () => {
      throw new Error('outbox table unreadable');
    }) as never;
    await expect(broken.service.record({ ...input, dedupeKey: 'rate_limits:admin-1:v6' })).resolves.toBe('pending');

    const failingDrain = harness();
    failingDrain.outbox.dispatchOneTransactionally.mockRejectedValueOnce(new Error('claim lost'));
    await expect(
      failingDrain.service.record({ ...input, dedupeKey: 'rate_limits:admin-1:v7' }),
    ).resolves.toBe('pending');
  });

  it('generates a unique key per event and refuses a malformed one', async () => {
    const first = defaultPrivilegedAuditKey(input);
    const second = defaultPrivilegedAuditKey(input);
    expect(first).not.toBe(second);
    expect(isPrivilegedAuditKey(first)).toBe(true);
    expect(isPrivilegedAuditKey('short')).toBe(false);
    expect(isPrivilegedAuditKey('has space and more text')).toBe(false);

    const { service } = harness();
    await expect(service.record({ ...input, dedupeKey: 'bad key with spaces' })).rejects.toThrow(
      'PRIVILEGED_AUDIT_KEY_INVALID',
    );
  });

  it('collapses two calls with the same key into one intent (one event)', async () => {
    const { service, intents, enqueued } = harness();
    const key = 'auth.admin_bulk_password_reset:admin-1:run-1';
    const first = await service.record({ ...input, dedupeKey: key });
    const second = await service.record({ ...input, dedupeKey: key });
    expect([first, second]).toEqual(['pending', 'pending']);
    expect(enqueued).toHaveLength(2); // two attempts …
    expect(intents.size).toBe(1); // … one event
  });

  it('writes the intent on the caller transaction and does not deliver by itself', async () => {
    const { service, outbox, transactionClient } = harness();
    const answer = await service.recordWithinTransaction(transactionClient as never, {
      ...input,
      dedupeKey: 'rate_limits:admin-1:v4',
    });
    expect(answer).toEqual({ dedupeKey: 'rate_limits:admin-1:v4' });
    expect(outbox.enqueue).toHaveBeenCalledWith(transactionClient, expect.objectContaining({ dedupeKey: 'rate_limits:admin-1:v4' }));
    expect(outbox.dispatchOneTransactionally).not.toHaveBeenCalled();
  });

  it('counts only real deliveries and logs a dead letter instead of silence', async () => {
    const { service, outbox } = harness();
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    outbox.dispatchOneTransactionally
      .mockResolvedValueOnce('succeeded')
      .mockResolvedValueOnce('retry')
      .mockResolvedValueOnce('dead-letter')
      .mockResolvedValueOnce('idle');

    await expect(service.drain(10)).resolves.toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('privileged_audit_dead_letter'));
  });

  it('reports ok while nothing is waiting and degraded once an intent is stale', async () => {
    const fresh = harness();
    await expect(fresh.service.health()).resolves.toMatchObject({ status: 'ok', pending: 0, stale: false });

    const stale = harness({ stale: true });
    await stale.service.record({ ...input, dedupeKey: 'rate_limits:admin-1:v5' });
    const health = await stale.service.health(new Date());
    expect(health).toMatchObject({ status: 'degraded', pending: 1, stale: true });
    expect(health.oldestPendingAgeMs).toBeGreaterThanOrEqual(privilegedAuditPendingWarningMs);
  });

  it('reports degraded for a dead letter even when nothing is pending', async () => {
    const { service } = harness({ deadLetter: 1 });
    await expect(service.health()).resolves.toMatchObject({
      status: 'degraded',
      deadLetter: 1,
      pending: 0,
      stale: false,
    });
  });

  it('round-trips exactly the fields an audit entry needs, and rejects a malformed payload', () => {
    const payload = toPrivilegedAuditPayload({
      ...input,
      requestId: 'req-1',
      organizationalUnitId: 'ou-1',
    });
    expect(readPrivilegedAuditPayload(payload)).toEqual({
      ...input,
      requestId: 'req-1',
      organizationalUnitId: 'ou-1',
    });
    expect(() => readPrivilegedAuditPayload({ action: 'x' } as JsonValue)).toThrow(
      'PRIVILEGED_AUDIT_PAYLOAD_INVALID',
    );
    expect(() => readPrivilegedAuditPayload(['not', 'an', 'object'] as JsonValue)).toThrow(
      'PRIVILEGED_AUDIT_PAYLOAD_INVALID',
    );
  });
});
