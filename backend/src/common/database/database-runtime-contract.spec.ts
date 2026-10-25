import {
  assertConnectionBudget,
  assertDatabaseTransport,
  databaseSessionOptions,
  expectedSchemaMigration,
  schemaCompatibilityQuery,
} from './database-runtime-contract';

describe('database runtime contract', () => {
  it('requires hostname-verifying TLS in production', () => {
    expect(() => assertDatabaseTransport('postgresql://u:p@db/app', { NODE_ENV: 'production' })).toThrow(
      'sslmode=verify-full',
    );
    expect(() =>
      assertDatabaseTransport('postgresql://u:p@db/app?sslmode=verify-full', { NODE_ENV: 'production' }),
    ).not.toThrow();
    expect(() => assertDatabaseTransport('postgresql://u:p@db/app', { NODE_ENV: 'test' })).not.toThrow();
  });

  it('sets statement, lock and idle transaction deadlines', () => {
    expect(databaseSessionOptions({ statementTimeoutMs: 5000, lockTimeoutMs: 2000, idleInTransactionTimeoutMs: 10000 })).toBe(
      '-c statement_timeout=5000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=10000',
    );
  });

  it('rejects a deployment-wide pool budget above max_connections', () => {
    expect(() => assertConnectionBudget({ DB_MAX_CONNECTIONS: '100' })).toThrow('requested=102');
    expect(() =>
      assertConnectionBudget({ DB_MAX_CONNECTIONS: '120', API_REPLICAS: '2', DB_POOL_MAX: '40' }),
    ).not.toThrow();
  });

  it('pins readiness to the latest successful migration', () => {
    const query = schemaCompatibilityQuery();
    expect(query.values).toEqual([expectedSchemaMigration]);
    expect(query.text).toContain('finished_at IS NULL');
    expect(expectedSchemaMigration).toBe('20271025160000_request_idempotency');
  });
});
