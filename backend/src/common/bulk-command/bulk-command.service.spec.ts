import { BulkCommandItemError } from './bulk-command.error';
import { BulkCommandService } from './bulk-command.service';

function service(): BulkCommandService {
  return new BulkCommandService({
    $transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({}),
  } as never);
}

describe('BulkCommandService', () => {
  it.each([
    { mode: 'unknown', items: [{ key: 'item-1', payload: 1 }] },
    { mode: 'atomic', items: [] },
    { mode: 'atomic', items: Array.from({ length: 101 }, (_, index) => ({ key: `item-${index}`, payload: index })) },
    { mode: 'best-effort', items: [{ key: 'duplicate', payload: 1 }, { key: 'duplicate', payload: 2 }] },
  ])('rejects an invalid or unbounded request', async (request) => {
    await expect(service().execute({ ...request, handle: async () => true } as never))
      .rejects.toMatchObject({ code: 'BULK_COMMAND_INVALID_REQUEST' });
  });

  it('returns only success results when an atomic command commits', async () => {
    await expect(service().execute({
      mode: 'atomic', items: [{ key: 'item-1', payload: 1 }, { key: 'item-2', payload: 2 }],
      handle: async ({ payload }) => payload * 2,
    })).resolves.toEqual(expect.objectContaining({
      outcome: 'SUCCEEDED', committed: true, succeeded: 2, failed: 0,
      results: [
        { key: 'item-1', status: 'SUCCEEDED', value: 2 },
        { key: 'item-2', status: 'SUCCEEDED', value: 4 },
      ],
    }));
  });

  it('marks prior work rolled back and later work skipped after an atomic failure', async () => {
    const result = await service().execute({
      mode: 'atomic', items: [1, 2, 3].map((payload) => ({ key: `item-${payload}`, payload })),
      handle: async ({ payload }) => {
        if (payload === 2) throw new BulkCommandItemError('ITEM_CONFLICT', 'Version conflict');
        return payload;
      },
    });
    expect(result).toMatchObject({ outcome: 'FAILED', committed: false, succeeded: 0, failed: 1 });
    expect(result.results).toEqual([
      { key: 'item-1', status: 'ROLLED_BACK' },
      { key: 'item-2', status: 'FAILED', error: { code: 'ITEM_CONFLICT', message: 'Version conflict', retryable: false } },
      { key: 'item-3', status: 'SKIPPED' },
    ]);
  });

  it('makes best-effort partial success explicit and redacts unknown errors', async () => {
    const result = await service().execute({
      mode: 'best-effort', items: [1, 2, 3].map((payload) => ({ key: `item-${payload}`, payload })),
      handle: async ({ payload }) => {
        if (payload === 2) throw new Error('database password leaked');
        return payload;
      },
    });
    expect(result).toMatchObject({ outcome: 'PARTIAL', committed: true, succeeded: 2, failed: 1 });
    expect(result.results[1]).toEqual({
      key: 'item-2', status: 'FAILED',
      error: { code: 'BULK_COMMAND_INTERNAL_FAILURE', message: 'BULK_COMMAND_INTERNAL_FAILURE', retryable: false },
    });
  });
});
