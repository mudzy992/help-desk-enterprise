import { auditLogActions } from '../audit-log/audit-log.constants';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { recordUserChange } from './record-user-change';
import { createUser } from './create-user';
import { prepareTemporaryPassword } from './issue-temporary-password-for-user';
import { resolveTemporaryPasswordChannel } from './send-temporary-password-email';
import { UsersError } from './users.error';

jest.mock('./record-user-change', () => ({
  recordUserChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./issue-temporary-password-for-user', () => ({
  prepareTemporaryPassword: jest.fn().mockResolvedValue({
    temporaryPassword: 'TempPassword!23456',
    localPasswordHash: 'hash-1',
  }),
}));

jest.mock('./send-temporary-password-email', () => ({
  resolveTemporaryPasswordChannel: jest.fn().mockResolvedValue('ui'),
  sendTemporaryPasswordEmail: jest.fn().mockResolvedValue(false),
}));

jest.mock('./list-users-summary', () => ({
  listUsersSummary: jest.fn(async (_prisma: unknown, options: { ids: readonly string[] }) =>
    options.ids.map((id) => ({
      id,
      displayName: 'Test User',
      email: 'user@example.com',
      roleKey: 'USER',
      roleName: 'User',
      roleTone: 'user',
      organizationalUnitName: null,
      groupName: null,
      policyPackKey: null,
      isActive: true,
      isLocalOnly: true,
      openTicketCount: 0,
    })),
  ),
}));

/**
 * W2.26 (`BA-users-02`): "Kreiranje usera/passworda/role nije atomsko i autorizacija
 * role dolazi prekasno."
 *
 * These tests are written against the commit boundary, because that is what the
 * finding was about: every write must be observably inside **one** transaction, the
 * forbidden-role answer must arrive before the first write, and no secret may exist
 * for an operation that failed.
 */
type Write = string;

function harness(
  options: {
    readonly channel?: 'ui' | 'email';
    readonly withOutbox?: boolean;
    readonly failAudit?: boolean;
    readonly failRoleCreate?: boolean;
    readonly failOutbox?: boolean;
    readonly failPasswordPreparation?: boolean;
    readonly existingEmail?: boolean;
    readonly missingUnit?: boolean;
  } = {},
) {
  const writes: Write[] = [];
  const outsideTransaction: Write[] = [];
  const committed: Write[] = [];
  let transactionDepth = 0;
  let transactionCalls = 0;

  const track = (name: Write) => {
    writes.push(name);
    if (transactionDepth === 0) outsideTransaction.push(name);
  };

  const transaction = {
    user: {
      create: jest.fn(async () => {
        track('user.create');
        return {
          id: 'user-1',
          displayName: 'Test User',
          email: 'user@example.com',
          organizationalUnitId: null,
          isLocalOnly: true,
          isActive: true,
          mustChangePassword: true,
          localPasswordHash: 'hash-1',
        };
      }),
    },
    role: {
      findUnique: jest.fn(async () => ({ id: 'role-user' })),
      create: jest.fn(async () => {
        track('role.create');
        return { id: 'role-user' };
      }),
    },
    // The role grant appends its own audit row on the same transaction.
    $executeRaw: jest.fn(async () => 0),
    auditLog: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => {
        track('audit.append');
        return {};
      }),
    },
    userRole: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => {
        if (options.failRoleCreate === true) throw new Error('role grant failed');
        track('userRole.create');
        return {
          id: 'assignment-1',
          userId: 'user-1',
          roleId: 'role-user',
          organizationalUnitId: null,
          serviceId: null,
          role: { key: authorizationRoleKeys.user, name: 'User' },
          organizationalUnit: null,
          service: null,
        };
      }),
    },
  };

  const prisma = {
    organizationalUnit: {
      findUnique: jest.fn(async () => (options.missingUnit === true ? null : { id: 'ou-1' })),
    },
    user: {
      findUnique: jest.fn(async () =>
        options.existingEmail === true ? { id: 'existing' } : null,
      ),
    },
    $transaction: jest.fn(async (run: (client: unknown) => Promise<unknown>) => {
      transactionCalls += 1;
      transactionDepth += 1;
      const staged = writes.length;
      try {
        const result = await run(transaction);
        transactionDepth -= 1;
        committed.push(...writes.slice(staged));
        return result;
      } catch (error) {
        writes.length = staged;
        transactionDepth -= 1;
        throw error;
      }
    }),
  };

  const enqueue = jest.fn(async () => {
    if (options.failOutbox === true) throw new Error('outbox unavailable');
    track('outbox.enqueue');
    return { id: 'outbox-1', created: true };
  });

  jest.mocked(resolveTemporaryPasswordChannel).mockResolvedValue(options.channel ?? 'ui');
  jest.mocked(prepareTemporaryPassword).mockImplementation(async () => {
    if (options.failPasswordPreparation === true) {
      throw new UsersError('TEMPORARY_PASSWORD_GENERATION_FAILED');
    }
    return { temporaryPassword: 'TempPassword!23456', localPasswordHash: 'hash-1' };
  });
  jest.mocked(recordUserChange).mockImplementation(async () => {
    if (options.failAudit === true) throw new Error('audit insert failed');
    track('audit.user');
    return undefined;
  });

  return {
    prisma,
    transaction,
    enqueue,
    writes,
    committed,
    outsideTransaction,
    transactionCalls: () => transactionCalls,
  };
}

const dependencies = (
  enqueue: jest.Mock | undefined,
  withOutbox = true,
): Parameters<typeof createUser>[2] => ({
  settingsService: { getSetting: jest.fn(async () => null) } as never,
  mailTransport: { send: jest.fn() } as never,
  ...(withOutbox && enqueue !== undefined ? { outbox: { enqueue } as never } : {}),
});

const input = {
  displayName: 'Test User',
  email: 'User@Example.com',
  roleKey: authorizationRoleKeys.user,
  actorUserId: 'actor-1',
  actorIsSuperAdmin: false,
  requestId: 'req-1',
};

describe('createUser (W2.26)', () => {
  beforeEach(() => {
    jest.mocked(recordUserChange).mockReset();
    jest.mocked(recordUserChange).mockResolvedValue(undefined);
    jest.mocked(prepareTemporaryPassword).mockClear();
    jest.mocked(resolveTemporaryPasswordChannel).mockClear();
  });

  it('commits user, credential, role, delivery intent and audit in one transaction', async () => {
    const test = harness({ channel: 'email' });

    const response = await createUser(
      test.prisma as never,
      input,
      dependencies(test.enqueue),
    );

    expect(test.transactionCalls()).toBe(1);
    expect(test.outsideTransaction).toEqual([]);
    expect(test.committed).toEqual([
      'user.create',
      'userRole.create',
      'audit.append',
      'outbox.enqueue',
      'audit.user',
    ]);
    // The secret never leaves the committed path on the e-mail channel.
    expect(response.temporaryPassword).toBeNull();
    expect(response.temporaryPasswordDelivery).toBe('email');
    expect(test.transaction.user.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ localPasswordHash: expect.anything() }),
    });
  });

  it('keeps the ui channel in-band: hashed in the commit, returned once', async () => {
    const test = harness({ channel: 'ui' });

    const response = await createUser(test.prisma as never, input, dependencies(test.enqueue));

    expect(test.committed).toEqual([
      'user.create',
      'userRole.create',
      'audit.append',
      'audit.user',
    ]);
    expect(test.enqueue).not.toHaveBeenCalled();
    expect(response.temporaryPassword).toBe('TempPassword!23456');
    expect(response.temporaryPasswordDelivery).toBe('ui');
    expect(test.transaction.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ localPasswordHash: 'hash-1', mustChangePassword: true }),
    });
  });

  it('normalises the address before it is written', async () => {
    const test = harness();
    await createUser(test.prisma as never, input, dependencies(test.enqueue));
    expect(test.transaction.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'user@example.com' }),
    });
  });

  it('refuses a SUPER_ADMIN grant to a non-super-admin before the first write', async () => {
    const test = harness();

    await expect(
      createUser(
        test.prisma as never,
        { ...input, roleKey: authorizationRoleKeys.superAdmin },
        dependencies(test.enqueue),
      ),
    ).rejects.toMatchObject({ code: 'SUPER_ADMIN_GRANT_FORBIDDEN' });

    // The finding in one line: no transaction was even opened.
    expect(test.prisma.$transaction).not.toHaveBeenCalled();
    expect(test.writes).toEqual([]);
    expect(prepareTemporaryPassword).not.toHaveBeenCalled();
    expect(test.enqueue).not.toHaveBeenCalled();
  });

  it('refuses an unknown role key, a missing unit and a duplicate address before writing', async () => {
    const unknownRole = harness();
    await expect(
      createUser(unknownRole.prisma as never, { ...input, roleKey: 'NOT_A_ROLE' }, dependencies(unknownRole.enqueue)),
    ).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' });

    const missingUnit = harness({ missingUnit: true });
    await expect(
      createUser(
        missingUnit.prisma as never,
        { ...input, organizationalUnitId: 'ou-missing' },
        dependencies(missingUnit.enqueue),
      ),
    ).rejects.toMatchObject({ code: 'ORGANIZATIONAL_UNIT_NOT_FOUND' });

    const duplicate = harness({ existingEmail: true });
    await expect(
      createUser(duplicate.prisma as never, input, dependencies(duplicate.enqueue)),
    ).rejects.toMatchObject({ code: 'EMAIL_CONFLICT' });

    for (const test of [unknownRole, missingUnit, duplicate]) {
      expect(test.prisma.$transaction).not.toHaveBeenCalled();
      expect(test.writes).toEqual([]);
    }
  });

  it('writes nothing when the temporary password cannot be issued', async () => {
    const test = harness({ failPasswordPreparation: true });

    await expect(
      createUser(test.prisma as never, input, dependencies(test.enqueue)),
    ).rejects.toMatchObject({ code: 'TEMPORARY_PASSWORD_GENERATION_FAILED' });

    expect(test.prisma.$transaction).not.toHaveBeenCalled();
    expect(test.writes).toEqual([]);
  });

  it('rolls the account back when the role grant fails', async () => {
    const test = harness({ failRoleCreate: true });

    await expect(
      createUser(test.prisma as never, input, dependencies(test.enqueue)),
    ).rejects.toThrow('role grant failed');

    expect(test.committed).toEqual([]);
    expect(test.writes).toEqual([]);
    expect(test.enqueue).not.toHaveBeenCalled();
  });

  it('rolls the account back when the audit insert fails', async () => {
    const test = harness({ failAudit: true });

    await expect(
      createUser(test.prisma as never, input, dependencies(test.enqueue)),
    ).rejects.toThrow('audit insert failed');

    expect(test.committed).toEqual([]);
    expect(test.writes).toEqual([]);
  });

  it('rolls the account back when the delivery intent cannot be written', async () => {
    const test = harness({ channel: 'email', failOutbox: true });

    await expect(
      createUser(test.prisma as never, input, dependencies(test.enqueue)),
    ).rejects.toThrow('outbox unavailable');

    // A committed account without a delivery would be an account nobody can enter.
    expect(test.committed).toEqual([]);
    expect(test.writes).toEqual([]);
  });

  it('degrades to in-band delivery instead of creating an unreachable account', async () => {
    const test = harness({ channel: 'email' });

    const response = await createUser(test.prisma as never, input, dependencies(undefined, false));

    expect(response.temporaryPassword).toBe('TempPassword!23456');
    expect(response.temporaryPasswordDelivery).toBe('ui');
    // …and the degraded path still hashes the credential it hands over.
    expect(test.transaction.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ localPasswordHash: 'hash-1' }),
    });
  });

  it('records how the secret left the system in the creation audit entry', async () => {
    const test = harness({ channel: 'email' });

    await createUser(test.prisma as never, input, dependencies(test.enqueue));

    expect(recordUserChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: auditLogActions.userCreated,
        entityId: 'user-1',
        actorUserId: 'actor-1',
        requestId: 'req-1',
        metadata: expect.objectContaining({
          roleKey: authorizationRoleKeys.user,
          temporaryPasswordDelivery: 'email',
          after: expect.objectContaining({ displayName: 'Test User', isLocalOnly: true }),
        }),
      }),
    );
  });

  it('rejects an empty display name before it reads anything', async () => {
    const test = harness();
    await expect(
      createUser(test.prisma as never, { ...input, displayName: '  ' }, dependencies(test.enqueue)),
    ).rejects.toBeInstanceOf(UsersError);
    expect(test.prisma.organizationalUnit.findUnique).not.toHaveBeenCalled();
  });
});
