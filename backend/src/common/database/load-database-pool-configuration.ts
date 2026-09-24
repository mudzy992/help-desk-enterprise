import type { PoolConfig } from 'pg';
import { databasePoolConstants } from './database-pool.constants';

/**
 * Turns the environment into an explicit pg pool configuration.
 *
 * Phase 1.4 of the performance plan: without this the adapter silently used the
 * node-postgres default of 10 connections and no `statement_timeout`, so one
 * slow statement could hold a connection for minutes.
 */

export type DatabasePoolConfiguration = {
  readonly max: number;
  readonly idleTimeoutMillis: number;
  readonly connectionTimeoutMillis: number;
  readonly statementTimeoutMillis: number;
  readonly applicationName: string;
};

/** Who is talking to the database; workers get a longer statement budget. */
export type DatabasePoolRole = 'api' | 'worker';

/** The worker container sets `DATABASE_POOL_ROLE=worker` (see docker-compose). */
export const databasePoolRoleEnvironmentKey = 'DATABASE_POOL_ROLE';

export function readDatabasePoolRole(
  environment: NodeJS.Dict<string> = process.env,
): DatabasePoolRole {
  return environment[databasePoolRoleEnvironmentKey]?.trim().toLowerCase() ===
    'worker'
    ? 'worker'
    : 'api';
}

const { environmentKeys, defaults, limits } = databasePoolConstants;

export function loadDatabasePoolConfiguration(
  environment: NodeJS.Dict<string> = process.env,
  role: DatabasePoolRole = 'api',
): DatabasePoolConfiguration {
  const isWorker = role === 'worker';
  return {
    max: readInteger(
      environment[environmentKeys.max],
      defaults.max,
      limits.minimumMax,
      limits.maximumMax,
      environmentKeys.max,
    ),
    idleTimeoutMillis: readInteger(
      environment[environmentKeys.idleTimeoutMs],
      defaults.idleTimeoutMs,
      limits.minimumTimeoutMs,
      limits.maximumTimeoutMs,
      environmentKeys.idleTimeoutMs,
    ),
    connectionTimeoutMillis: readInteger(
      environment[environmentKeys.connectionTimeoutMs],
      defaults.connectionTimeoutMs,
      limits.minimumTimeoutMs,
      limits.maximumTimeoutMs,
      environmentKeys.connectionTimeoutMs,
    ),
    statementTimeoutMillis: readInteger(
      environment[environmentKeys.statementTimeoutMs],
      isWorker
        ? defaults.workerStatementTimeoutMs
        : defaults.statementTimeoutMs,
      limits.minimumTimeoutMs,
      limits.maximumTimeoutMs,
      environmentKeys.statementTimeoutMs,
    ),
    applicationName: isWorker
      ? defaults.workerApplicationName
      : defaults.applicationName,
  };
}

/**
 * Maps the configuration onto `pg.PoolConfig`. `statement_timeout` travels in
 * the startup `options` string, so no extra round trip is needed per connection
 * and the setting is active before the first statement runs.
 */
export function toDatabasePoolConfig(
  connectionString: string,
  configuration: DatabasePoolConfiguration,
): PoolConfig {
  return {
    connectionString,
    max: configuration.max,
    idleTimeoutMillis: configuration.idleTimeoutMillis,
    connectionTimeoutMillis: configuration.connectionTimeoutMillis,
    application_name: configuration.applicationName,
    options: `-c statement_timeout=${configuration.statementTimeoutMillis}`,
  };
}

function readInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  key: string,
): number {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === '') {
    return fallback;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${key} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}
