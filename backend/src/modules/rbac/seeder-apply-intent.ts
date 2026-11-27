/*
  W2.35 (`BA-rbac-08`): the default-role seeder is additive — it creates every
  missing `role -> permission` link. That is right during installation and wrong
  as an ordinary maintenance command: a permission a SuperAdmin removed on
  purpose is a decision, and a routine run must not silently undo it.

  The reviewed plan is therefore the unit of consent. `--dry-run` prints the plan
  and its fingerprint; the same command refuses to write unless it is given that
  fingerprint (`--confirm=<hash>`) or an explicit `--restore-defaults`.
*/

export const seedPlanFingerprintLength = 64;

export type SeedCommandRequest =
  | { readonly kind: 'dry-run' }
  | {
      readonly kind: 'apply';
      readonly consent: 'fingerprint' | 'restore-defaults';
      /** Present for `--confirm`; `undefined` for `--restore-defaults`. */
      readonly confirmedFingerprint?: string;
    }
  | { readonly kind: 'invalid'; readonly message: string };

const dryRunFlag = '--dry-run';
const restoreDefaultsFlag = '--restore-defaults';
const confirmFlag = '--confirm=';

/**
 * Reads only the seeder's own flags. `process.argv` starts with the runtime and
 * the script path, so the first two entries are skipped here as well.
 */
export function parseSeedCommandRequest(
  argv: readonly string[],
): SeedCommandRequest {
  const flags = argv.slice(2);
  const unknown = flags.filter(
    (flag) =>
      flag !== dryRunFlag &&
      flag !== restoreDefaultsFlag &&
      !flag.startsWith(confirmFlag),
  );
  if (unknown.length > 0) {
    return {
      kind: 'invalid',
      message: `unknown argument(s): ${unknown.join(' ')}`,
    };
  }
  const dryRun = flags.includes(dryRunFlag);
  const restoreDefaults = flags.includes(restoreDefaultsFlag);
  const confirmations = flags
    .filter((flag) => flag.startsWith(confirmFlag))
    .map((flag) => flag.slice(confirmFlag.length).trim());
  if (dryRun && (restoreDefaults || confirmations.length > 0)) {
    return {
      kind: 'invalid',
      message: `${dryRunFlag} does not write, so it cannot be combined with ${confirmFlag}<hash> or ${restoreDefaultsFlag}`,
    };
  }
  if (restoreDefaults && confirmations.length > 0) {
    return {
      kind: 'invalid',
      message: `${restoreDefaultsFlag} and ${confirmFlag}<hash> are two different consents; use one`,
    };
  }
  if (confirmations.length > 1) {
    return {
      kind: 'invalid',
      message: `${confirmFlag}<hash> may be given once`,
    };
  }
  if (dryRun) {
    return { kind: 'dry-run' };
  }
  if (restoreDefaults) {
    return { kind: 'apply', consent: 'restore-defaults' };
  }
  if (confirmations.length === 1) {
    const confirmedFingerprint = confirmations[0] ?? '';
    if (confirmedFingerprint.length === 0) {
      return {
        kind: 'invalid',
        message: `${confirmFlag} needs the fingerprint printed by ${dryRunFlag}`,
      };
    }
    return { kind: 'apply', consent: 'fingerprint', confirmedFingerprint };
  }
  return { kind: 'invalid', message: 'no consent given' };
}

export type SeedApplyDecision =
  | { readonly allowed: true; readonly consent: 'fingerprint' | 'restore-defaults' }
  | {
      readonly allowed: false;
      readonly reason: 'confirmation-required' | 'fingerprint-mismatch';
      readonly message: string;
    };

/**
 * The rule the acceptance criterion asks for: an ordinary run — no flag, or a
 * fingerprint that no longer describes the current plan — must not write.
 */
export function evaluateSeedApplyRequest(
  request: SeedCommandRequest,
  currentFingerprint: string,
): SeedApplyDecision {
  if (request.kind === 'dry-run') {
    return {
      allowed: false,
      reason: 'confirmation-required',
      message: 'dry run: nothing is written',
    };
  }
  if (request.kind === 'invalid') {
    return {
      allowed: false,
      reason: 'confirmation-required',
      message: `${request.message}. Run with --dry-run, then pass --confirm=<fingerprint> or --restore-defaults.`,
    };
  }
  if (request.consent === 'restore-defaults') {
    return { allowed: true, consent: 'restore-defaults' };
  }
  if (request.confirmedFingerprint !== currentFingerprint) {
    return {
      allowed: false,
      reason: 'fingerprint-mismatch',
      message:
        '--confirm does not match the current plan (the role matrix changed since the dry run). ' +
        'Run --dry-run again and confirm the new fingerprint.',
    };
  }
  return { allowed: true, consent: 'fingerprint' };
}
