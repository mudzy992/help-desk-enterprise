import { createHash } from 'node:crypto';

/*
  W1.5 (`BA-xcut-08`): every destructive CLI has to say *which* database it is
  about to write to before it writes.

  The audit finding was concrete: `assets-seed-demo` wrote demo data into
  whatever `DATABASE_URL` pointed at, and `--remove` hard-deleted several tables
  without a production guard, a typed confirmation or an audit row. The fix
  starts here: a target is not a connection string any more, it is
  (environment, host, database, fingerprint) and the operator has to name it.

  The fingerprint is a sha256 over `host:port/database` only — never the
  credentials, never the full URL — so it can be printed, typed back by the
  operator and stored in the audit log without leaking a password.
*/

export const cliEnvironments = ['development', 'staging', 'production'] as const;
export type CliEnvironment = (typeof cliEnvironments)[number];

export type DatabaseTarget = Readonly<{ host: string; port: string; database: string }>;

export type CliTarget = DatabaseTarget &
  Readonly<{ environment: CliEnvironment; fingerprint: string }>;

/**
 * Every refusal in the CLI guard is this error: the reason is a stable code the
 * operator (and a test) can match on, and the exit code is 2 — the same "you
 * invoked me wrong" code the other CLIs in this folder already use.
 */
export class CliInvocationError extends Error {
  constructor(
    readonly reason: string,
    readonly exitCode = 2,
  ) {
    super(reason);
    this.name = 'CliInvocationError';
  }
}

/**
 * `null` = flag absent, `''` = flag present without a value. The difference
 * matters: `--reason` with nothing after it must fail as "too short", not as
 * "missing", and a typo like `--applyy` must be rejected instead of silently
 * falling back to a dry run.
 */
export function readCliFlag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = argv[index + 1];
  return value !== undefined && !value.startsWith('--') ? value.trim() : '';
}

export function parseDatabaseTarget(connectionString: string): DatabaseTarget {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new CliInvocationError('CLI_DATABASE_URL_INVALID');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new CliInvocationError('CLI_DATABASE_URL_INVALID');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//u, '')).trim();
  const host = url.hostname.trim();
  if (host.length === 0 || database.length === 0) {
    throw new CliInvocationError('CLI_DATABASE_URL_INCOMPLETE');
  }
  return { host, port: url.port.length > 0 ? url.port : '5432', database };
}

export function fingerprintTarget(target: DatabaseTarget): string {
  return createHash('sha256')
    .update(`${target.host}:${target.port}/${target.database}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * The environment is *declared*, never inferred from the host name: guessing
 * "this looks like localhost, so it must be development" is exactly how demo
 * data lands in production. The one inference we do keep is a refusal — a
 * container built with `NODE_ENV=production` may not claim to be development.
 */
export function resolveCliTarget(input: {
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly databaseUrl: string | undefined;
}): CliTarget {
  const declared = readCliFlag(input.argv, 'environment') ?? (input.env.CLI_ENVIRONMENT?.trim() ?? null);
  if (declared === null || declared.length === 0) {
    throw new CliInvocationError('CLI_ENVIRONMENT_REQUIRED');
  }
  if (!(cliEnvironments as readonly string[]).includes(declared)) {
    throw new CliInvocationError(`CLI_ENVIRONMENT_INVALID:${declared}`);
  }
  const environment = declared as CliEnvironment;
  const nodeEnv = (input.env.NODE_ENV ?? '').trim();
  if (nodeEnv === 'production' && environment !== 'production') {
    throw new CliInvocationError(`CLI_ENVIRONMENT_MISMATCH:${environment}:NODE_ENV=production`);
  }
  if (input.databaseUrl === undefined || input.databaseUrl.trim().length === 0) {
    throw new CliInvocationError('CLI_DATABASE_URL_REQUIRED');
  }
  const target = parseDatabaseTarget(input.databaseUrl);
  return { ...target, environment, fingerprint: fingerprintTarget(target) };
}

/**
 * What the operator has to type back for a write. It names the command, the
 * environment and the target database — three things that have to agree before
 * anything is written, so "I confirmed *a* delete" is never enough.
 */
export function confirmationPhrase(input: {
  readonly command: string;
  readonly target: Pick<CliTarget, 'environment' | 'fingerprint'>;
}): string {
  return `${input.command}@${input.target.environment}:${input.target.fingerprint}`;
}

export function formatCliTarget(target: CliTarget): string {
  const where = `${target.host}:${target.port}/${target.database}`;
  const redacted = where.replace(/\/\/[^@/]*@/u, '//');
  return `${target.environment} ${redacted} (${target.fingerprint})`;
}
