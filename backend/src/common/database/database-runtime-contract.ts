import type { PoolConfig } from 'pg';

export const expectedSchemaMigration =
  '20271030110000_asset_transfer_retention_lifecycle';

export function assertDatabaseTransport(
  connectionString: string,
  environment: NodeJS.Dict<string> = process.env,
): void {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use postgresql://');
  }
  if (environment.NODE_ENV === 'production') {
    const sslMode = url.searchParams.get('sslmode');
    if (sslMode !== 'verify-full') {
      throw new Error('production DATABASE_URL requires sslmode=verify-full');
    }
  }
}

export function databaseSessionOptions(input: {
  readonly statementTimeoutMs: number;
  readonly lockTimeoutMs: number;
  readonly idleInTransactionTimeoutMs: number;
}): string {
  return [
    `-c statement_timeout=${input.statementTimeoutMs}`,
    `-c lock_timeout=${input.lockTimeoutMs}`,
    `-c idle_in_transaction_session_timeout=${input.idleInTransactionTimeoutMs}`,
  ].join(' ');
}

export function schemaCompatibilityQuery(): {
  readonly text: string;
  readonly values: readonly [string];
} {
  return {
    text: `SELECT EXISTS (
      SELECT 1 FROM "_prisma_migrations"
      WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    ) AND NOT EXISTS (
      SELECT 1 FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    ) AS compatible`,
    values: [expectedSchemaMigration],
  };
}

export function assertConnectionBudget(environment: NodeJS.Dict<string>): void {
  const read = (key: string, fallback: number): number => {
    const value = Number(environment[key] ?? fallback);
    if (!Number.isInteger(value) || value < 0) throw new Error(`${key} must be a non-negative integer`);
    return value;
  };
  const api = read('API_REPLICAS', 2) * read('DB_POOL_MAX', 40);
  const worker = read('WORKER_REPLICAS', 1) * read('WORKER_DB_POOL_MAX', 10);
  const release = read('MIGRATOR_CONNECTION_BUDGET', 2);
  const reserve = read('DB_CONNECTION_RESERVE', 10);
  const maximum = read('DB_MAX_CONNECTIONS', 100);
  const requested = api + worker + release + reserve;
  if (requested > maximum) {
    throw new Error(`database connection budget exceeded: requested=${requested}, max=${maximum}`);
  }
}

export type RuntimePoolConfig = PoolConfig & { readonly options: string };
