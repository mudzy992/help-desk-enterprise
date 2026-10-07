jest.mock(
  './record-user-change',
  () => ({ recordUserChange: jest.fn().mockResolvedValue(undefined) }),
  { virtual: true },
);
jest.mock('./list-users-summary', () => ({
  listUsersSummary: jest.fn(async (_prisma: unknown, input: { ids: readonly string[] }) =>
    input.ids.map((id) => ({ id, email: `${id}@example.test`, displayName: id, isActive: false }))),
}));

import { updateUser } from './update-user';

type TestUser = {
  id: string;
  email: string;
  isLocalOnly: boolean;
  entraObjectId: string | null;
  displayName: string;
  organizationalUnitId: string | null;
  isActive: boolean;
};

/** A shared transaction lock and state model: concurrent requests serialize at the advisory-lock call. */
function createTwoSuperAdminWorld() {
  const users = new Map<string, TestUser>([
    ['admin-a', { id: 'admin-a', email: 'a@example.test', isLocalOnly: true, entraObjectId: null, displayName: 'Admin A', organizationalUnitId: null, isActive: true }],
    ['admin-b', { id: 'admin-b', email: 'b@example.test', isLocalOnly: true, entraObjectId: null, displayName: 'Admin B', organizationalUnitId: null, isActive: true }],
  ]);
  const roleOwners = new Set(users.keys());
  let lockTail = Promise.resolve();

  const transactionFor = () => {
    let unlock: (() => void) | null = null;
    return {
      $executeRaw: async () => {
        const previous = lockTail;
        let release!: () => void;
        lockTail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        unlock = release;
        return 1;
      },
      release: () => unlock?.(),
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const user = users.get(where.id);
          return user === undefined
            ? null
            : { isActive: user.isActive, isLocalOnly: user.isLocalOnly, entraObjectId: user.entraObjectId };
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<TestUser> }) => {
          const user = users.get(where.id);
          if (user === undefined) throw new Error('user missing');
          Object.assign(user, data);
          return user;
        }),
      },
      userRole: {
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const isEligible = (id: string) => {
            const user = users.get(id);
            return user?.isActive === true && user.isLocalOnly && user.entraObjectId === null;
          };
          if (typeof where.userId === 'string') {
            return roleOwners.has(where.userId) && isEligible(where.userId)
              ? { id: `role-${where.userId}` }
              : null;
          }
          const exclusion = where.userId as { not: string } | undefined;
          const match = [...roleOwners].find(
            (id) => id !== exclusion?.not && isEligible(id),
          );
          return match === undefined ? null : { id: `role-${match}` };
        }),
      },
    };
  };

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const user = users.get(where.id);
        return user === undefined ? null : { ...user };
      }),
    },
    organizationalUnit: { findUnique: jest.fn() },
    $transaction: async <T>(callback: (transaction: unknown) => Promise<T>): Promise<T> => {
      const transaction = transactionFor();
      try {
        return await callback(transaction);
      } finally {
        transaction.release();
      }
    },
  };
  return { prisma, users };
}

describe('last-active-SuperAdmin invariant serialization', () => {
  it('does not allow concurrent deactivation of the final two SuperAdmins to both commit', async () => {
    const { prisma, users } = createTwoSuperAdminWorld();
    const outcomes = await Promise.allSettled([
      updateUser(prisma as never, { userId: 'admin-a', isActive: false }),
      updateUser(prisma as never, { userId: 'admin-b', isActive: false }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect([...users.values()].filter((user) => user.isActive)).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'LAST_SUPER_ADMIN_REQUIRED' } });
  });
});
