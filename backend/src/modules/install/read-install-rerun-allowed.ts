import { installRerunEnvironmentKey, installRerunErrorCodes } from './install-rerun.constants';
import { InstallRerunError } from './install-rerun.error';

/**
 * Owner decision 6: the switch is off by default and only the exact value `true`
 * counts (upper/lower case, whitespace trimmed). A deployment that carries a
 * stale `1` or `yes` must not quietly reopen a finished installation.
 *
 * Like `readDatabasePoolRole`, the environment key lives in a named constant and
 * `scripts/check-env-example.mjs` reads it from the source as the contract for
 * `.env.example`.
 */
export function readInstallRerunAllowed(environment: NodeJS.Dict<string> = process.env): boolean {
  return environment[installRerunEnvironmentKey]?.trim().toLowerCase() === 'true';
}

export function assertInstallRerunAllowed(environment: NodeJS.Dict<string> = process.env): void {
  if (readInstallRerunAllowed(environment)) {
    return;
  }
  throw new InstallRerunError(
    installRerunErrorCodes.notAllowed,
    `Install wizard rerun is disabled; set ${installRerunEnvironmentKey}=true on the backend to reopen a finished installation (ops only)`,
  );
}
