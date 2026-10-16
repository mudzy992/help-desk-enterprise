/*
  F6 — when the two wizard specs may run at all.

  They walk the **whole** flow, starting at the package step, so the wizard has to
  be at its first step when they open it. Two states look "open" but are not:

  * a finished installation (`isCompleted: true`) — the specs skip themselves, and
    the CI job's Preflight fails loudly before the browser starts;
  * a reopened installation whose steps still carry their markers. `nextStep` is
    then the readiness screen (`provisioning`, the one step that is never
    reported as done), which is exactly what an operator sees after
    `install-rerun` **without** `--include-step-markers`. Walking from there is
    impossible, because the answered steps are stored rows — so the specs fail
    with the command that fixes the environment instead of dying on a heading
    mismatch 20 s later (`expectStep(page, 'profile')`, CI run 2026-10-16).

  The rule lives here, not in the specs, so both specs and (in its own words) the
  CI Preflight can state it once.
*/

export type InstallStatusSnapshot = {
  readonly isCompleted?: boolean;
  readonly nextStep?: string | null;
};

/** The reopen recipe, spelled the same way `ops/runbook/ponovno-pokretanje-instalacije.md` does. */
export const wizardResetHint =
  'Reset the installation (Postgres is an external service, not a compose volume):\n' +
  '  psql "$DATABASE_URL" -c \'drop schema public cascade; create schema public\'\n' +
  '  cd backend && npm run db:init   # prisma migrate deploy && prisma db seed';

/** The reopen recipe, spelled the same way `ops/runbook/ponovno-pokretanje-instalacije.md` does. */
export const wizardReopenHint =
  'Reopen the wizard with the step markers cleared first (INSTALL_ALLOW_RERUN=true):\n' +
  '  docker exec -i <backend> node dist/src/cli/install-rerun.js --reason "E2E install wizard" --include-step-markers\n' +
  'or\n' +
  '  curl -sS -X POST <api>/install/restart -H "x-install-token: $INSTALL_TOKEN" \\\n' +
  '    -H "content-type: application/json" -d \'{"includeStepMarkers": true}\'\n' +
  'Runbook: ops/runbook/ponovno-pokretanje-instalacije.md';

/**
 * `null` when the specs may walk, otherwise the sentence that says what to do.
 * A missing `nextStep` counts as "not at the first step": the wizard's first
 * screen is the package step, and guessing is how a spec ends up asserting the
 * wrong thing.
 */
export function wizardStartFailure(status: InstallStatusSnapshot): string | null {
  if (status.nextStep === 'profile') {
    return null;
  }
  const seen = status.nextStep === undefined || status.nextStep === null ? 'unknown' : status.nextStep;
  return (
    `[install-wizard] the wizard is not at its first step (nextStep=${seen}), so the ` +
    'installation already has its answers and the specs cannot walk it from the package ' +
    'step. A database reset is the only fully clean option: reopening keeps the existing ' +
    'users, and the specs assert that the post-install checklist names exactly the two ' +
    'deferred steps.\n' +
    wizardResetHint +
    '\n' +
    wizardReopenHint
  );
}
