import { RoleHoldersInvalidationDispatcher } from './role-holders-invalidation.dispatcher';
import { roleHoldersInvalidationNamespace } from './role-holders-invalidation';

type Handler = (event: {
  readonly id: string;
  readonly key: string;
  readonly revision: number;
}) => Promise<void>;

function createDispatcher(results: ('idle' | 'succeeded' | 'retry')[]) {
  const handlers: Handler[] = [];
  const invalidation = {
    dispatchOne: jest.fn(
      async (_namespace: string, handler: Handler): Promise<string> => {
        handlers.push(handler);
        return results.shift() ?? 'idle';
      },
    ),
  };
  const invalidator = {
    roleHolderVersions: jest
      .fn()
      .mockResolvedValue([{ userId: 'user-1', authzVersion: 4 }]),
    publishCommittedRoleHolders: jest.fn().mockResolvedValue(1),
  };
  const dispatcher = new RoleHoldersInvalidationDispatcher(
    invalidation as never,
    invalidator as never,
  );
  return { dispatcher, invalidation, invalidator, handlers };
}

describe('RoleHoldersInvalidationDispatcher (BA-rbac-05)', () => {
  it('drains the committed role invalidations until the outbox is idle', async () => {
    const { dispatcher, invalidation } = createDispatcher(['succeeded', 'idle']);
    await dispatcher.drain();
    expect(invalidation.dispatchOne).toHaveBeenCalledTimes(2);
    expect(invalidation.dispatchOne).toHaveBeenCalledWith(
      roleHoldersInvalidationNamespace,
      expect.any(Function),
    );
  });

  it('re-reads the holders at delivery time and publishes their committed versions', async () => {
    const { dispatcher, invalidator, handlers } = createDispatcher([
      'succeeded',
      'idle',
    ]);
    await dispatcher.drain();
    await handlers[0]!({ id: 'outbox-1', key: 'role-1', revision: 4 });
    expect(invalidator.roleHolderVersions).toHaveBeenCalledWith('role-1');
    expect(invalidator.publishCommittedRoleHolders).toHaveBeenCalledWith(
      'role-1',
      [{ userId: 'user-1', authzVersion: 4 }],
    );
  });

  it('publishes nothing for a role that lost all of its holders', async () => {
    const { dispatcher, invalidator, handlers } = createDispatcher([
      'succeeded',
      'idle',
    ]);
    invalidator.roleHolderVersions.mockResolvedValue([]);
    await dispatcher.drain();
    await handlers[0]!({ id: 'outbox-1', key: 'role-1', revision: 4 });
    expect(invalidator.publishCommittedRoleHolders).not.toHaveBeenCalled();
  });

  it('lets the failure escape so the outbox owns the retry', async () => {
    const { dispatcher, invalidator, handlers } = createDispatcher([
      'retry',
      'idle',
    ]);
    invalidator.publishCommittedRoleHolders.mockRejectedValue(
      new Error('redis_unavailable'),
    );
    await dispatcher.drain();
    await expect(
      handlers[0]!({ id: 'outbox-1', key: 'role-1', revision: 4 }),
    ).rejects.toThrow('redis_unavailable');
  });
});
