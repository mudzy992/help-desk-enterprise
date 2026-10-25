import { DatabaseLockService } from './database-lock.service';

describe('DatabaseLockService', () => {
  const service = new DatabaseLockService();

  it.each([
    { namespace: 'A', key: 'valid-key' },
    { namespace: 'ab', key: 'valid-key' },
    { namespace: 'valid.namespace', key: '' },
    { namespace: 'valid.namespace', key: 'bad key' },
  ])('rejects an invalid lock identity: %p', async (identity) => {
    await expect(service.withAdvisoryLock({} as never, identity, async () => true))
      .rejects.toMatchObject({ code: 'DATABASE_LOCK_IDENTITY_INVALID' });
  });

  it('rejects unbounded timeout values before touching the database', async () => {
    await expect(service.withAdvisoryLock(
      {} as never, { namespace: 'workflow.test', key: 'singleton' }, async () => true, 30_001,
    )).rejects.toMatchObject({ code: 'DATABASE_LOCK_IDENTITY_INVALID' });
  });

  it('requires the row-lock callback to find a row before executing the operation', async () => {
    const operation = jest.fn();
    await expect(service.withRowLock({ lock: async () => null, operation }))
      .rejects.toMatchObject({ code: 'DATABASE_LOCK_ROW_NOT_FOUND' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('passes the locked snapshot to the row operation', async () => {
    await expect(service.withRowLock({
      lock: async () => ({ id: 'row-1', version: 4 }),
      operation: async (row) => row.version + 1,
    })).resolves.toBe(5);
  });
});
