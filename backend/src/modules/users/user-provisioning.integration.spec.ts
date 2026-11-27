import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { createUser } from './create-user';
import { resolveTemporaryPasswordChannel } from './send-temporary-password-email';
import { TemporaryPasswordDeliveryDispatcher } from './temporary-password-delivery.dispatcher';
import {
  temporaryPasswordDeliveryDedupeKey,
  temporaryPasswordDeliveryTopic,
} from './temporary-password-delivery.outbox';

/**
 * W2.26 (`BA-users-02`) — the finding, end to end on a real PostgreSQL.
 *
 * Original defect: `createUser` committed the account, committed and mailed the
 * password, and asked "may this actor grant that role?" last. A forbidden
 * `SUPER_ADMIN` grant (or any later failure) therefore left an active account behind,
 * sometimes with a secret already delivered.
 *
 * Acceptance: a forbidden role and a fault in **every** step leave no partial
 * user/role/password state and never send a secret for a failed operation.
 *
 * The delivery *channel* is a settings decision and is stubbed here (`jest.mock`);
 * everything that makes the bug possible — transactions, unique constraints, audit
 * chain, outbox rows, the delivery worker — is the real thing.
 */
jest.mock('./send-temporary-password-email', () => ({
  resolveTemporaryPasswordChannel: jest.fn().mockResolvedValue('email'),
  sendTemporaryPasswordEmail: jest.fn().mockResolvedValue(true),
}));

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('user provisioning (integration)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient | undefined;
  let outbox: TransactionalOutboxService;
  let organizationalUnitId = '';
  const userIds: string[] = [];
  const suffix = `${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    outbox = new TransactionalOutboxService(database() as never);
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT provisioning ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-provisioning-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-provisioning-${suffix}`,
      },
      select: { id: true },
    });
    organizationalUnitId = unit.id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    await db.outboxMessage.deleteMany({ where: { topic: temporaryPasswordDeliveryTopic } });
    await db.auditLog.deleteMany({ where: { entityId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (organizationalUnitId !== '') {
      await db.organizationalUnit.delete({ where: { id: organizationalUnitId } });
    }
    await db.$disconnect();
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  const mailTransport = { send: jest.fn() };
  const settingsService = { getSetting: jest.fn(async () => null) } as never;

  const emailFor = (name: string): string =>
    `provisioning-${name}-${suffix}@firma.ba`;

  const inputFor = (name: string, overrides: Record<string, unknown> = {}) => ({
    displayName: `Provisioning ${name}`,
    email: emailFor(name),
    organizationalUnitId,
    roleKey: authorizationRoleKeys.user,
    actorUserId: null,
    actorIsSuperAdmin: false,
    requestId: `req-${suffix}`,
    ...overrides,
  });

  const dependencies = () => ({
    settingsService,
    mailTransport: mailTransport as never,
    outbox,
  });

  beforeEach(() => {
    jest.mocked(resolveTemporaryPasswordChannel).mockResolvedValue('email');
    jest.mocked(mailTransport.send).mockReset();
    jest.mocked(mailTransport.send).mockResolvedValue(undefined);
  });

  it('commits the account, the slot for the credential, the role, the audit and the delivery intent together', async () => {
    const input = inputFor('commit');
    const response = await createUser(database() as never, input, dependencies());

    userIds.push(response.user.id);
    expect(response.temporaryPassword).toBeNull();
    expect(response.temporaryPasswordDelivery).toBe('email');

    const user = await database().user.findUniqueOrThrow({
      where: { id: response.user.id },
      select: {
        email: true,
        isLocalOnly: true,
        isActive: true,
        mustChangePassword: true,
        localPasswordHash: true,
        organizationalUnitId: true,
      },
    });
    // No credential exists yet: the e-mail channel never writes a plaintext, and the
    // worker issues the password at delivery time.
    expect(user).toMatchObject({
      isLocalOnly: true,
      isActive: true,
      mustChangePassword: true,
      localPasswordHash: null,
      organizationalUnitId,
    });
    expect(user.email).toBe(input.email);

    await expect(
      database().userRole.count({ where: { userId: response.user.id } }),
    ).resolves.toBe(1);

    const actions = await database().auditLog.findMany({
      where: { entityId: response.user.id },
      select: { action: true },
      orderBy: { createdAt: 'asc' },
    });
    // Both entries belong to the same commit; the chain partition differs, so their
    // relative order is not part of the contract.
    expect(actions.map((row) => row.action).sort()).toEqual(
      [auditLogActions.userRoleAssign, auditLogActions.userCreated].sort(),
    );

    const intent = await database().outboxMessage.findUniqueOrThrow({
      where: {
        topic_dedupeKey: {
          topic: temporaryPasswordDeliveryTopic,
          dedupeKey: temporaryPasswordDeliveryDedupeKey(response.user.id),
        },
      },
      select: { payload: true, status: true, maxAttempts: true },
    });
    expect(intent.status).toBe('PENDING');
    expect(intent.maxAttempts).toBe(8);
    // The intent names a recipient and nothing else: no credential at rest.
    expect(JSON.stringify(intent.payload)).not.toMatch(/password/iu);

    // …and nothing was mailed by the request path.
    expect(mailTransport.send).not.toHaveBeenCalled();
  });

  it('refuses a SUPER_ADMIN grant for a non-super-admin and leaves no trace at all', async () => {
    const input = inputFor('forbidden', { roleKey: authorizationRoleKeys.superAdmin });
    const before = await database().user.count({ where: { email: input.email } });
    const auditsBefore = await database().auditLog.count();

    await expect(
      createUser(database() as never, input, dependencies()),
    ).rejects.toMatchObject({ code: 'SUPER_ADMIN_GRANT_FORBIDDEN' });

    await expect(database().user.count({ where: { email: input.email } })).resolves.toBe(before);
    await expect(
      database().outboxMessage.count({
        where: { topic: temporaryPasswordDeliveryTopic, payload: { path: ['email'], equals: input.email } },
      }),
    ).resolves.toBe(0);
    await expect(database().auditLog.count()).resolves.toBe(auditsBefore);
    expect(mailTransport.send).not.toHaveBeenCalled();
  });

  it('rolls the whole account back when the transaction dies after the intent is written', async () => {
    const input = inputFor('fault');
    const auditsBefore = await database().auditLog.count();
    // The process dies immediately after the outbox INSERT executed, before commit.
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
                      throw new Error('process died after writing the delivery intent');
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
      createUser(crashing as never, input, dependencies()),
    ).rejects.toThrow('process died after writing the delivery intent');

    await expect(database().user.count({ where: { email: input.email } })).resolves.toBe(0);
    await expect(
      database().outboxMessage.count({
        where: { topic: temporaryPasswordDeliveryTopic, payload: { path: ['email'], equals: input.email } },
      }),
    ).resolves.toBe(0);
    await expect(database().auditLog.count()).resolves.toBe(auditsBefore);
    expect(mailTransport.send).not.toHaveBeenCalled();
  });

  it('delivers the credential out of the intent, once, and only then marks it done', async () => {
    const input = inputFor('delivery');
    const response = await createUser(database() as never, input, dependencies());
    userIds.push(response.user.id);

    const dispatcher = new TemporaryPasswordDeliveryDispatcher(
      outbox,
      database() as never,
      settingsService,
      mailTransport as never,
      undefined,
    );

    // A failed mail must not leave a password behind that nobody received.
    jest.mocked(mailTransport.send).mockRejectedValueOnce(new Error('smtp down'));
    await expect(dispatcher.drain(1)).resolves.toBe(0);
    const afterFailure = await database().user.findUniqueOrThrow({
      where: { id: response.user.id },
      select: { localPasswordHash: true },
    });
    expect(afterFailure.localPasswordHash).toBeNull();

    const pending = await database().outboxMessage.findFirstOrThrow({
      where: {
        topic: temporaryPasswordDeliveryTopic,
        dedupeKey: temporaryPasswordDeliveryDedupeKey(response.user.id),
      },
      select: { id: true, status: true },
    });
    expect(pending.status).not.toBe('SUCCEEDED');

    await database().outboxMessage.update({
      where: { id: pending.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await expect(dispatcher.drain(1)).resolves.toBe(1);

    const delivered = await database().user.findUniqueOrThrow({
      where: { id: response.user.id },
      select: { localPasswordHash: true, mustChangePassword: true },
    });
    expect(delivered.localPasswordHash).not.toBeNull();
    expect(delivered.mustChangePassword).toBe(true);
    expect(mailTransport.send).toHaveBeenCalledTimes(2);

    await expect(
      database().outboxMessage.findUniqueOrThrow({
        where: { id: pending.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'SUCCEEDED' });
  });

  it('keeps credentials in-band on the ui channel, with no delivery intent', async () => {
    jest.mocked(resolveTemporaryPasswordChannel).mockResolvedValue('ui');
    const input = inputFor('ui');

    const response = await createUser(database() as never, input, dependencies());
    userIds.push(response.user.id);

    expect(response.temporaryPasswordDelivery).toBe('ui');
    expect(response.temporaryPassword).not.toBeNull();
    const user = await database().user.findUniqueOrThrow({
      where: { id: response.user.id },
      select: { localPasswordHash: true },
    });
    expect(user.localPasswordHash).not.toBeNull();
    await expect(
      database().outboxMessage.count({
        where: {
          topic: temporaryPasswordDeliveryTopic,
          dedupeKey: temporaryPasswordDeliveryDedupeKey(response.user.id),
        },
      }),
    ).resolves.toBe(0);
    expect(mailTransport.send).not.toHaveBeenCalled();
  });
});
