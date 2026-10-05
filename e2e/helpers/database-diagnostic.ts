/*
  CI (2026-10-05): `E2E_DATABASE_URL` pointed at a Coolify/Docker-internal
  hostname (`hgpchekxb6dutalsyctu42al`), which only resolves inside the stack
  network. `pg` then failed with the bare `getaddrinfo EAI_AGAIN <host>` and the
  job log said nothing about what to fix. These helpers keep that diagnosis out
  of the runner's head: the message names the host (never the credentials), the
  scope of the problem and the concrete ways out.
*/

/** Host of the connection string, without credentials. Null when unparseable. */
export function databaseHost(connectionString: string): string | null {
  try {
    const url = new URL(connectionString);
    return url.hostname === '' ? null : url.hostname;
  } catch {
    return null;
  }
}

const dnsErrorCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'ENODATA', 'ESERVFAIL']);

/** True for "this runner cannot resolve the host" failures (not auth refusals). */
export function isDnsFailure(error: unknown): boolean {
  const code = (error as { readonly code?: unknown } | null)?.code;
  if (typeof code === 'string' && dnsErrorCodes.has(code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /getaddrinfo/i.test(message);
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export type UnreachableDatabasePlan = {
  /** Warn and continue when a TOTP secret is known; otherwise the run must stop. */
  readonly continueAnyway: boolean;
  readonly message: string;
};

/**
 * The MFA reset is only needed to make the super admin re-enrol on the next
 * sign-in. When the database cannot be reached but a TOTP secret for that
 * account is known (`E2E_SUPERADMIN_TOTP_SECRET`), the suite can still run;
 * without one the login will stop at `MFA_REQUIRED`, so failing here is the
 * clearer outcome.
 */
export function planUnreachableDatabase(input: {
  readonly host: string | null;
  readonly error: unknown;
  readonly totpSecretKnown: boolean;
}): UnreachableDatabasePlan {
  const host = input.host ?? '<unparseable host in DATABASE_URL>';
  const reason = isDnsFailure(input.error)
    ? `the host "${host}" does not resolve from a GitHub-hosted runner`
    : `connecting to "${host}" failed: ${describeError(input.error)}`;
  const options = [
    'Set E2E_DATABASE_URL to a connection string that is reachable from GitHub runners:',
    '  a) publish the Postgres port in Coolify (public TCP port) and use that host and port;',
    '  b) open a tunnel on the runner (E2E_SSH_* secrets, see e2e/README.md) and use 127.0.0.1:15432;',
    '  c) drop the database: set E2E_SUPERADMIN_TOTP_SECRET and leave E2E_DATABASE_URL empty.',
    'Internal Coolify/Docker names (for example a bare 26-character service id) only work inside the stack network.',
  ].join('\n  ');
  const message = `[e2e] MFA reset skipped: ${reason}.\n  ${options}`;
  return { continueAnyway: input.totpSecretKnown, message };
}
