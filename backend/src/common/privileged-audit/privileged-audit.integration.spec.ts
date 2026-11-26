import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { TransactionalOutboxService } from '../outbox/transactional-outbox.service';
import {
  privilegedAuditPendingWarningMs,
  privilegedAuditTopic,
} from './privileged-audit.outbox';
import { PrivilegedAuditService } from './privileged-audit.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/*
  W2.24 (`BA-security-03`): the acceptance from `docs/backend/audits/09-security.md`,
  proven against real PostgreSQL instead of a recorder:

    "audit outage ne gubi događaj; nakon oporavka tačno jedan koreliran zapis postoji."

  The fault is a real one — the audit append throws inside the delivery
  transaction — and the observable is the `AuditLog` table itself:

    1. outage        -> `record` answers `pending`, the intent survives, and no
                        entry exists yet (nothing is reported as journalled);
    2. recovery      -> one `deliverPending()` produces exactly one entry, a
                        second one produces none (the entry and the completion are
                        the same commit);
    3. duplicate     -> two `record` calls with one key are one entry;
    4. transactional -> the intent lives in the caller's transaction: it commits
                        with the mutation and disappears with a rollback;
    5. dead letter   -> an intent that cannot be delivered is visible as
                        `degraded`, never as silence.
*/
describeIfDatabase('privileged audit outbox (integration)', () => {
  jest.setTimeout(180_000);

  const stamp = `${process.pid}-${Date.now()}`;
  const actorUserId = `privileged-audit-it-${stamp}`;
  /**
   * A real, registered action: the audit policy validates its metadata against the
   * allowlist (`accountDelayStartsAfterFailures`, `ipMaxFailures`,
   * `ipWindowSeconds`, `otherMaxFailures`). The first CI run of this spec used an
   * extra `phase` marker and proved the policy is strict — every delivery failed
   * with `AUDIT_METADATA_FIELD_NOT_ALLOWED`, so the outage path looked healthy.
   */
  const action = 'auth.rate_limits_changed';

  let prisma: PrismaClient;
  /** The audit-append fault: `true` means "audit storage is unavailable". */
  const auditStorage = { down: false };

  function key(name: string): string {
    return `it.privileged.audit:${stamp}:${name}`;
  }

  /**
   * A client whose `$transaction` hands out a client that refuses the audit
   * append while `auditStorage.down` is set. Everything else is the real client,
   * so the state under test is the database's state.
   */
  function faultyClient(source: PrismaClient, state: { down: boolean }): PrismaClient {
    const wrapTransactionClient = (client: object): object =>
      new Proxy(client, {
        get(target, property) {
          if (property === 'auditLog' && state.down) {
            const auditLog = Reflect.get(target, property, target) as object;
            return new Proxy(auditLog, {
              get(inner, innerProperty) {
                if (innerProperty === 'create') {
                  return async () => {
                    throw new Error('audit storage unavailable');
                  };
                }
                const value = Reflect.get(inner, innerProperty, inner);
                return typeof value === 'function' ? value.bind(inner) : value;
              },
            });
          }
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });

    return new Proxy(source, {
      get(target, property) {
        if (property === '$transaction') {
          return (argument: unknown, options?: unknown) => {
            const transaction = Reflect.get(target, property, target) as (...args: unknown[]) => unknown;
            if (typeof argument !== 'function') return transaction.call(target, argument, options);
            return transaction.call(
              target,
              (client: object) => (argument as (client: object) => unknown)(wrapTransactionClient(client)),
              options,
            );
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as PrismaClient;
  }

  function service(client: PrismaClient = prisma): PrivilegedAuditService {
    return new PrivilegedAuditService(client as never, new TransactionalOutboxService(client as never));
  }

  async function entries(entityId: string): Promise<{ action: string; entityId: string; metadata: unknown }[]> {
    return prisma.auditLog.findMany({
      where: { entityId },
      select: { action: true, entityId: true, metadata: true },
    });
  }

  async function intentRows(dedupeKey: string) {
    return prisma.outboxMessage.findMany({
      where: { topic: privilegedAuditTopic, dedupeKey },
      select: { status: true, attempts: true, lastError: true },
    });
  }

  /** Skips the retry backoff so the test does not have to wait it out. */
  async function makeDue(dedupeKey: string): Promise<void> {
    await prisma.outboxMessage.updateMany({
      where: { topic: privilegedAuditTopic, dedupeKey },
      data: { nextAttemptAt: new Date(0) },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    await prisma.auditLog.deleteMany({ where: { entityId: actorUserId } });
    await prisma.outboxMessage.deleteMany({ where: { topic: privilegedAuditTopic, dedupeKey: { startsWith: `it.privileged.audit:${stamp}` } } });
  });

  afterAll(async () => {
    if (prisma === undefined) return;
    await prisma.auditLog.deleteMany({ where: { entityId: actorUserId } }).catch(() => undefined);
    await prisma.outboxMessage
      .deleteMany({ where: { topic: privilegedAuditTopic, dedupeKey: { startsWith: `it.privileged.audit:${stamp}` } } })
      .catch(() => undefined);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    auditStorage.down = false;
    await prisma.auditLog.deleteMany({ where: { entityId: actorUserId } });
    await prisma.outboxMessage.deleteMany({
      where: { topic: privilegedAuditTopic, dedupeKey: { startsWith: `it.privileged.audit:${stamp}` } },
    });
  });

  it('keeps the event through an audit outage and writes exactly one entry after recovery', async () => {
    const dedupeKey = key('outage');
    const faulty = faultyClient(prisma, auditStorage);
    const writer = service(faulty);

    auditStorage.down = true;
    const outcome = await writer.record({
      action,
      entityType: 'user',
      entityId: actorUserId,
      actorUserId,
      metadata: { ipMaxFailures: 55, ipWindowSeconds: 120 },
      dedupeKey,
    });

    expect(outcome).toBe('pending');
    expect(await entries(actorUserId)).toHaveLength(0);
    const [parked] = await intentRows(dedupeKey);
    expect(parked).toMatchObject({ status: 'PENDING' });
    expect(parked!.attempts).toBeGreaterThanOrEqual(1);
    expect(parked!.lastError).toContain('audit storage unavailable');
    await expect(writer.health()).resolves.toMatchObject({ status: 'ok', pending: 1, stale: false });

    // Recovery: the same writer, the same key, the same payload.
    auditStorage.down = false;
    await makeDue(dedupeKey);
    await writer.deliverPending(5);

    const delivered = await entries(actorUserId);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ action, entityId: actorUserId });
    expect(delivered[0]!.metadata).toMatchObject({ ipMaxFailures: 55, ipWindowSeconds: 120 });
    await expect(intentRows(dedupeKey)).resolves.toEqual([
      expect.objectContaining({ status: 'SUCCEEDED' }),
    ]);

    // A replay of a completed intent is not a second entry.
    await writer.deliverPending(5);
    expect(await entries(actorUserId)).toHaveLength(1);
    await expect(writer.health()).resolves.toMatchObject({ status: 'ok', pending: 0, stale: false });
  });

  it('collapses two calls with the same key into one entry', async () => {
    const dedupeKey = key('duplicate');
    const writer = service();

    const payload = {
      action,
      entityType: 'user',
      entityId: actorUserId,
      actorUserId,
      metadata: { ipMaxFailures: 41 },
      dedupeKey,
    } as const;
    const first = await writer.record(payload);
    const second = await writer.record(payload);

    expect([first, second]).toEqual(['delivered', 'delivered']);
    expect(await entries(actorUserId)).toHaveLength(1);
    expect(await intentRows(dedupeKey)).toHaveLength(1);
  });

  it('commits the intent with the caller transaction and drops it on rollback', async () => {
    const writer = service();
    const committedKey = key('commit');
    const rolledBackKey = key('rollback');

    await prisma.$transaction(async (transaction) => {
      await writer.recordWithinTransaction(transaction, {
        action,
        entityType: 'user',
        entityId: actorUserId,
        actorUserId,
        metadata: { accountDelayStartsAfterFailures: 3 },
        dedupeKey: committedKey,
      });
    });
    // Nothing was delivered yet: a caller that never drains is covered by the timer.
    expect(await entries(actorUserId)).toHaveLength(0);
    await writer.deliverPending(5);
    expect(await entries(actorUserId)).toHaveLength(1);

    await expect(
      prisma.$transaction(async (transaction) => {
        await writer.recordWithinTransaction(transaction, {
          action,
          entityType: 'user',
          entityId: actorUserId,
          actorUserId,
          metadata: { otherMaxFailures: 7 },
          dedupeKey: rolledBackKey,
        });
        throw new Error('the mutation failed');
      }),
    ).rejects.toThrow('the mutation failed');

    expect(await intentRows(rolledBackKey)).toHaveLength(0);
    expect(await entries(actorUserId)).toHaveLength(1);
  });

  it('reads a dead-lettered intent as degraded, and a stale one too', async () => {
    const writer = service();
    const deadKey = key('dead');
    const staleKey = key('stale');

    await prisma.outboxMessage.create({
      data: {
        topic: privilegedAuditTopic,
        dedupeKey: deadKey,
        payload: { action, entityType: 'user', entityId: actorUserId, actorUserId, metadata: { ipMaxFailures: 9 } },
        payloadHash: '0'.repeat(64),
        status: 'DEAD_LETTER',
        attempts: 20,
        maxAttempts: 20,
        lastError: 'audit storage unavailable',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const dead = await writer.health();
    expect(dead).toMatchObject({ status: 'degraded', deadLetter: 1 });
    expect(dead.pending).toBe(0);

    await prisma.outboxMessage.deleteMany({ where: { dedupeKey: deadKey } });
    await prisma.outboxMessage.create({
      data: {
        topic: privilegedAuditTopic,
        dedupeKey: staleKey,
        payload: { action, entityType: 'user', entityId: actorUserId, actorUserId, metadata: { ipMaxFailures: 11 } },
        payloadHash: '1'.repeat(64),
        status: 'PENDING',
        nextAttemptAt: new Date(Date.now() + 3_600_000),
        createdAt: new Date(Date.now() - privilegedAuditPendingWarningMs - 60_000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const stale = await writer.health();
    expect(stale).toMatchObject({ status: 'degraded', pending: 1, stale: true });
    expect(stale.oldestPendingAgeMs).toBeGreaterThanOrEqual(privilegedAuditPendingWarningMs);
  });
});
