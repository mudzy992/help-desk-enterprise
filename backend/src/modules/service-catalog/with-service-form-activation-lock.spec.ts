import { withServiceFormActivationLock } from './with-service-form-activation-lock';

describe('withServiceFormActivationLock', () => {
  it('acquires the service advisory lock and writer table lock before mutation', async () => {
    const events: string[] = [];
    const queryRaw = jest.fn(
      async (query: TemplateStringsArray, ..._values: unknown[]) => {
        events.push(`query:${query.join(' ')}`);
        return [];
      },
    );
    const executeRaw = jest.fn(
      async (query: TemplateStringsArray, ..._values: unknown[]) => {
        events.push(`execute:${query.join(' ')}`);
        return 0;
      },
    );
    const transaction = { $queryRaw: queryRaw, $executeRaw: executeRaw } as never;

    const result = await withServiceFormActivationLock(
      transaction,
      'service-activation-lock-test',
      async () => {
        events.push('mutation');
        return 'activated';
      },
    );

    expect(result).toBe('activated');
    expect(events[0]).toContain("set_config('lock_timeout'");
    expect(events[1]).toContain('pg_advisory_xact_lock');
    expect(queryRaw.mock.calls[1]?.[1]).toBe(
      `${'service-catalog.form-activation'.length}:service-catalog.form-activation:service-activation-lock-test`,
    );
    expect(events[2]).toContain(
      'LOCK TABLE "FormVersion" IN ROW EXCLUSIVE MODE',
    );
    expect(events[3]).toBe('mutation');
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});
