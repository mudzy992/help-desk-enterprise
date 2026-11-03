import { withServiceDowntimeWindowMutationLocks } from './with-service-downtime-window-mutation-lock';

describe('withServiceDowntimeWindowMutationLocks', () => {
  it('deduplicates service IDs and acquires advisory locks in stable sorted order', async () => {
    const queryRaw = jest.fn(
      async (_query: TemplateStringsArray, ..._values: unknown[]) => [],
    );
    const transaction = { $queryRaw: queryRaw } as never;
    const operation = jest.fn(async () => 'serialized');

    await expect(
      withServiceDowntimeWindowMutationLocks(
        transaction,
        ['service-b', 'service-a', 'service-a'],
        operation,
      ),
    ).resolves.toBe('serialized');

    expect(queryRaw).toHaveBeenCalledTimes(4);
    expect(queryRaw.mock.calls[1]?.[1]).toBe(
      `${'service-catalog.downtime-window'.length}:service-catalog.downtime-window:service-a`,
    );
    expect(queryRaw.mock.calls[3]?.[1]).toBe(
      `${'service-catalog.downtime-window'.length}:service-catalog.downtime-window:service-b`,
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('runs directly when the change has no linked downtime services', async () => {
    const queryRaw = jest.fn(
      async (_query: TemplateStringsArray, ..._values: unknown[]) => [],
    );
    const transaction = { $queryRaw: queryRaw } as never;
    const operation = jest.fn(async () => 'no-services');

    await expect(
      withServiceDowntimeWindowMutationLocks(transaction, [], operation),
    ).resolves.toBe('no-services');

    expect(queryRaw).not.toHaveBeenCalled();
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
