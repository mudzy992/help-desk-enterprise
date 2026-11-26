import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  parseSocketSessionInvalidation,
  socketSessionInvalidationChannel,
} from '../../common/security/socket-session-invalidation';
import { PrismaClient } from '../../generated/prisma/client';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { publishActorAuthzVersion } from '../../common/request-context/authz-version-probe';
import { runWithRequestId } from '../../common/request-context/request-context.storage';
import {
  invalidateActorGroupsCache,
  loadActorGroupMemberships,
} from '../../common/cache/scope-catalog-cache';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { GroupRoomRevokeDispatcher } from '../websocket/group-room-revoke.dispatcher';
import { removeGroupMember } from './remove-group-member';
import {
  groupRoomRevokeDedupeKey,
  groupRoomRevokeTopic,
  readGroupRoomRevokePayload,
} from './group-room-revoke.outbox';

/**
 * W2.25 (`BA-groups-02`) — the finding, end to end on a real PostgreSQL.
 *
 * "Membership revoke kasni do 30 s za HTTP i do 5 min za WebSocket group room."
 * Acceptance: two HTTP and two socket instances with **warm** state; the first
 * request and the first event after the `remove` commit must not reach the removed
 * member, including a retry/fault scenario.
 *
 * The unit suites prove each piece against fakes. This file proves the two
 * cross-process promises against one database:
 *
 *   1. the membership row, the `authzVersion` fence and the revoke intent commit
 *      together — a crash at the worst moment leaves all three, or none of them;
 *   2. an instance that never saw the write stops serving the removed group on its
 *      very first request after the commit (the version, not a timer, decides);
 *   3. the revoke intent survives a failed publish and still reaches every instance
 *      on retry — it is a durable event, not a fire-and-forget emit.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('group membership revoke (integration)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient | undefined;
  /** Second process: own Prisma client, own (warm) in-process snapshot cache. */
  let otherInstance: PrismaClient | undefined;
  let outbox: TransactionalOutboxService;
  let organizationalUnitId = '';
  let groupId = '';
  let otherGroupId = '';
  const userIds: string[] = [];
  const suffix = `${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    otherInstance = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    outbox = new TransactionalOutboxService(database() as never);
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT revoke ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-revoke-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-revoke-${suffix}`,
      },
      select: { id: true },
    });
    organizationalUnitId = unit.id;
    const [main, other] = await Promise.all([
      database().group.create({
        data: { name: `IT revoke ${suffix}`, key: `it-revoke-${suffix}`, organizationalUnitId },
        select: { id: true },
      }),
      database().group.create({
        data: { name: `IT revoke other ${suffix}`, key: `it-revoke-other-${suffix}`, organizationalUnitId },
        select: { id: true },
      }),
    ]);
    groupId = main.id;
    otherGroupId = other.id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    await db.outboxMessage.deleteMany({ where: { topic: groupRoomRevokeTopic } });
    await db.auditLog.deleteMany({ where: { entityId: { in: [groupId, otherGroupId] } } });
    await db.group.deleteMany({ where: { id: { in: [groupId, otherGroupId] } } });
    if (userIds.length > 0) await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (organizationalUnitId !== '') {
      await db.organizationalUnit.delete({ where: { id: organizationalUnitId } });
    }
    await db.$disconnect();
    await otherInstance?.$disconnect();
  });

  beforeEach(() => {
    invalidateActorGroupsCache();
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  function secondProcess(): PrismaClient {
    if (otherInstance === undefined) throw new Error('second instance was not initialized');
    return otherInstance;
  }

  async function createMember(name: string): Promise<{ readonly id: string }> {
    const user = await database().user.create({
      data: { email: `revoke-${name}-${suffix}@example.invalid`, displayName: `Revoke ${name}` },
      select: { id: true },
    });
    userIds.push(user.id);
    await database().groupMember.create({ data: { groupId, userId: user.id } });
    await database().groupMember.create({ data: { groupId: otherGroupId, userId: user.id } });
    return user;
  }

  /** The durable read a request performs before it decides anything (session revocation store). */
  async function authorityRead(client: PrismaClient, userId: string): Promise<number> {
    const row = await client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { authzVersion: true },
    });
    return row.authzVersion;
  }

  const warmSnapshot = (client: PrismaClient, userId: string, version: number) =>
    runWithRequestId(`warm-${randomUUID()}`, () => {
      publishActorAuthzVersion(version);
      return loadActorGroupMemberships(client as unknown as PrismaService, userId);
    });

  it('commits the deletion, the fence and the durable revoke in one transaction', async () => {
    const member = await createMember('commit');
    const before = await authorityRead(database(), member.id);

    await removeGroupMember(database() as never, groupId, member.id, async () => undefined, {
      actorUserId: null,
      requestId: `req-${suffix}`,
    }, outbox);

    await expect(
      database().groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: member.id } },
      }),
    ).resolves.toBeNull();
    const after = await authorityRead(database(), member.id);
    expect(after).toBe(before + 1);

    const intent = await database().outboxMessage.findUniqueOrThrow({
      where: {
        topic_dedupeKey: {
          topic: groupRoomRevokeTopic,
          dedupeKey: groupRoomRevokeDedupeKey({ groupId, subjectId: member.id, revision: after }),
        },
      },
      select: { payload: true, status: true, maxAttempts: true },
    });
    expect(intent.status).toBe('PENDING');
    // 20 attempts: the room event outlives a Redis outage, it does not give up fast.
    expect(intent.maxAttempts).toBe(20);
    expect(readGroupRoomRevokePayload(intent.payload as never)).toEqual({
      subjectId: member.id,
      groupId,
      revision: after,
    });
  });

  it('serves the removed group to nobody on the first request after the commit', async () => {
    const member = await createMember('http');
    const warmVersion = await authorityRead(database(), member.id);

    // Two HTTP instances, both warm: each has read the snapshot in an earlier request.
    const first = await warmSnapshot(database(), member.id, warmVersion);
    const second = await warmSnapshot(secondProcess(), member.id, warmVersion);
    expect(first.map((entry) => entry.groupId).sort()).toEqual([groupId, otherGroupId].sort());
    expect(second.map((entry) => entry.groupId).sort()).toEqual([groupId, otherGroupId].sort());

    // Warmth is a fact, not an assumption: the same request version on the same
    // instance answers from the snapshot (identical reference, no second read).
    expect(await warmSnapshot(secondProcess(), member.id, warmVersion)).toBe(second);

    await removeGroupMember(database() as never, groupId, member.id, async () => undefined, {
      actorUserId: null,
      requestId: `req-${suffix}`,
    }, outbox);
    const committedVersion = await authorityRead(database(), member.id);

    // The very next request on the instance that did **not** write: same process,
    // same 30 s snapshot, only the version changed. No timer, no sleep.
    const after = await warmSnapshot(secondProcess(), member.id, committedVersion);
    expect(after.map((entry) => entry.groupId)).toEqual([otherGroupId]);

    // …and the same on the writer instance.
    const local = await warmSnapshot(database(), member.id, committedVersion);
    expect(local.map((entry) => entry.groupId)).toEqual([otherGroupId]);

    // The old version is now a *miss by design*: an unprovable snapshot is never
    // served, so even a request that carries the stale version reads the authority
    // and sees the removal. That is the difference from the finding's 30 s window.
    const stale = await warmSnapshot(secondProcess(), member.id, warmVersion);
    expect(stale.map((entry) => entry.groupId)).toEqual([otherGroupId]);
  });

  it('keeps the membership and the fence when the transaction dies after writing the intent', async () => {
    const member = await createMember('fault');
    const before = await authorityRead(database(), member.id);

    // The process dies immediately after the outbox INSERT has been executed but
    // before the commit — the worst possible moment for a fire-and-forget revoke.
    const crashing = new Proxy(database(), {
      get(target, property) {
        if (property === '$transaction') {
          return (run: (client: unknown) => Promise<unknown>) =>
            target.$transaction(async (transaction) => {
              const crashingClient = new Proxy(transaction, {
                get(inner, innerProperty) {
                  if (innerProperty === '$queryRaw') {
                    const raw = Reflect.get(inner, innerProperty) as (...args: unknown[]) => unknown;
                    return async (...args: unknown[]) => {
                      await raw.apply(inner, args);
                      throw new Error('process died after writing the revoke intent');
                    };
                  }
                  const value = Reflect.get(inner, innerProperty);
                  return typeof value === 'function' ? value.bind(inner) : value;
                },
              });
              return run(crashingClient);
            });
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    await expect(
      removeGroupMember(crashing as never, groupId, member.id, async () => undefined, {
        actorUserId: null,
        requestId: `req-${suffix}`,
      }, outbox),
    ).rejects.toThrow('process died after writing the revoke intent');

    await expect(
      database().groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: member.id } },
      }),
    ).resolves.not.toBeNull();
    await expect(authorityRead(database(), member.id)).resolves.toBe(before);
    await expect(
      database().outboxMessage.count({
        where: { topic: groupRoomRevokeTopic, payload: { path: ['subjectId'], equals: member.id } },
      }),
    ).resolves.toBe(0);

    // A retry of the same operation is therefore the only way forward, and it works.
    await removeGroupMember(database() as never, groupId, member.id, async () => undefined, {
      actorUserId: null,
      requestId: `req-${suffix}`,
    }, outbox);
    await expect(authorityRead(database(), member.id)).resolves.toBe(before + 1);
  });

  it('delivers the room event after a failed publish, and only then marks it done', async () => {
    const member = await createMember('retry');
    await removeGroupMember(database() as never, groupId, member.id, async () => undefined, {
      actorUserId: null,
      requestId: `req-${suffix}`,
    }, outbox);

    const publish = jest
      .fn<Promise<number>, [string, string]>()
      .mockRejectedValueOnce(new Error('redis unavailable'));
    // `status: 'ready'` because the shared publisher refuses a client that is not
    // connected — the failure under test is the publish itself, not the client state.
    const dispatcher = new GroupRoomRevokeDispatcher(outbox, {
      status: 'ready',
      publish,
    } as never);

    await expect(dispatcher.drain(5)).resolves.toBe(0);
    const pending = await database().outboxMessage.findFirstOrThrow({
      where: { topic: groupRoomRevokeTopic, payload: { path: ['subjectId'], equals: member.id } },
      select: { status: true, attempts: true, lastError: true, id: true },
    });
    expect(pending.status).not.toBe('SUCCEEDED');
    // The shared publisher is best-effort (it swallows the transport error), so the
    // recorded reason is the dispatcher's failure class, not the socket error text:
    // what matters operationally is that the intent is *not* marked delivered.
    expect(pending.lastError).toContain('group_room_revoke_publish_failed');
    expect(publish).toHaveBeenCalledTimes(1);

    // The fault is transient; a retry is due immediately in this test.
    await database().outboxMessage.update({
      where: { id: pending.id },
      data: { nextAttemptAt: new Date(0) },
    });

    await expect(dispatcher.drain(5)).resolves.toBe(1);
    const delivered = await database().outboxMessage.findUniqueOrThrow({
      where: { id: pending.id },
      select: { status: true },
    });
    expect(delivered.status).toBe('SUCCEEDED');

    const [channel, message] = publish.mock.calls[1]!;
    expect(channel).toBe(socketSessionInvalidationChannel);
    expect(parseSocketSessionInvalidation(message)).toEqual({
      version: 1,
      kind: 'group',
      subjectId: member.id,
      groupId,
    });
  });
});
