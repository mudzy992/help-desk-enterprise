import { databasePoolConstants } from './database-pool.constants';
import {
  loadDatabasePoolConfiguration,
  readDatabasePoolRole,
  toDatabasePoolConfig,
} from './load-database-pool-configuration';

describe('loadDatabasePoolConfiguration', () => {
  it('uses the plan defaults when nothing is configured', () => {
    expect(loadDatabasePoolConfiguration({})).toEqual({
      max: 40,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000,
      statementTimeoutMillis: 5_000,
      applicationName: 'ep-helpdesk-api',
    });
  });

  it('gives the worker role a longer statement budget and its own name', () => {
    const configuration = loadDatabasePoolConfiguration({}, 'worker');

    expect(configuration.statementTimeoutMillis).toBe(30_000);
    expect(configuration.applicationName).toBe('ep-helpdesk-worker');
    expect(configuration.max).toBe(
      databasePoolConstants.defaults.max,
    );
  });

  it('reads overrides from the environment', () => {
    expect(
      loadDatabasePoolConfiguration({
        DB_POOL_MAX: '60',
        DB_POOL_IDLE_TIMEOUT_MS: '15000',
        DB_POOL_CONNECTION_TIMEOUT_MS: '1000',
        DB_STATEMENT_TIMEOUT_MS: '9000',
      }),
    ).toEqual({
      max: 60,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 1_000,
      statementTimeoutMillis: 9_000,
      applicationName: 'ep-helpdesk-api',
    });
  });

  it('rejects values outside the safety limits', () => {
    expect(() => loadDatabasePoolConfiguration({ DB_POOL_MAX: '0' })).toThrow(
      'DB_POOL_MAX must be an integer between 1 and 200',
    );
    expect(() => loadDatabasePoolConfiguration({ DB_POOL_MAX: '201' })).toThrow();
    expect(() =>
      loadDatabasePoolConfiguration({ DB_STATEMENT_TIMEOUT_MS: '10' }),
    ).toThrow('DB_STATEMENT_TIMEOUT_MS must be an integer between 100 and 600000');
    expect(() =>
      loadDatabasePoolConfiguration({ DB_POOL_MAX: 'many' }),
    ).toThrow('DB_POOL_MAX must be an integer between 1 and 200');
  });

  it('ignores blank values instead of failing', () => {
    expect(
      loadDatabasePoolConfiguration({ DB_POOL_MAX: '  ' }).max,
    ).toBe(40);
  });
});

describe('readDatabasePoolRole', () => {
  it('defaults to the api role', () => {
    expect(readDatabasePoolRole({})).toBe('api');
    expect(readDatabasePoolRole({ DATABASE_POOL_ROLE: 'API' })).toBe('api');
  });

  it('detects the worker role regardless of casing', () => {
    expect(readDatabasePoolRole({ DATABASE_POOL_ROLE: 'worker' })).toBe('worker');
    expect(readDatabasePoolRole({ DATABASE_POOL_ROLE: ' Worker ' })).toBe('worker');
  });
});

describe('toDatabasePoolConfig', () => {
  it('carries the timeouts and identifies the process', () => {
    const configuration = loadDatabasePoolConfiguration({
      DB_POOL_MAX: '12',
    });

    expect(toDatabasePoolConfig('postgresql://localhost:5432/ephelpdesk', configuration))
      .toEqual({
        connectionString: 'postgresql://localhost:5432/ephelpdesk',
        max: 12,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 3_000,
        application_name: 'ep-helpdesk-api',
        options: '-c statement_timeout=5000',
      });
  });
});
