# E2E critical flows (Playwright)

Hybrid UI + API suite for RAW acceptance flows. Unit Jest/Vitest stay untouched.

## Prerequisites

1. Postgres + Redis up (`docker-compose` or Coolify)
2. Backend migrated and running (`backend`: `npm run start:dev` + worker)
3. Frontend Vite (`frontend`: `npm run dev`)
4. Copy `e2e/.env.example` → `e2e/.env` and set accounts / `DATABASE_URL` for actor seeding

## Run

```bash
cd e2e
npm install
npx playwright install chromium
npm test
```

## Actors (decision A)

`global-setup` ensures install when needed, then provisions the local USER/AGENT **through the public API**
(`POST /users`, then `POST /users/:id/reset-password` + `POST /auth/change-password`), so the harness needs no
database access for accounts. `DATABASE_URL` is used **only** to clear the test super admin's MFA before a run
(`helpers/reset-super-admin-mfa.ts`); without it the harness relies on a stored secret or
`E2E_SUPERADMIN_TOTP_SECRET`.

## CI

Unit gate is `.github/workflows/ci.yml` (backend + frontend). E2E is a **separate** job (`E2E critical flows`)
on `workflow_dispatch` / `main` / `master` that expects a **live stack** — it does not start Postgres/Redis in
GitHub-hosted runners (Coolify contract). See `.cursor/plans/quality-e2e-critical-flows/HANDOFF.md`.

The job first typechecks this project (`npx tsc --noEmit -p tsconfig.json`), then runs a **Preflight** step
(prints `set`/`empty` per name — never a value — resolves the API and database hosts and calls
`$E2E_API_URL/health`), then `npm test`.

> **A green E2E job now means the specs ran.** When the repository variable `E2E_API_URL` is empty the
> Preflight step fails with `::error title=E2E did not run`, instead of silently passing (the earlier `exit 0`
> skip made a green checkmark meaningless).

### What the job needs: repository variables and secrets

| Name | Kind | Purpose |
|---|---|---|
| `E2E_API_URL` | variable | Base URL of the stack API (e.g. `https://api.desk.ba101.top`). **Empty → the job fails with `E2E did not run`.** |
| `E2E_BASE_URL` | variable | Frontend base URL (e.g. `https://desk.ba101.top`); defaults to `http://localhost:5173`. |
| `E2E_SUPERADMIN_EMAIL`, `E2E_SUPERADMIN_PASSWORD` | secret | Super admin that already exists on that stack; the harness only signs in (and clears MFA when `E2E_DATABASE_URL` is set). On a fresh stack `ensureInstall` also creates it, and the password must pass the account-security policy (see below). |
| `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` | secret | Disposable USER account of that stack; created and set up by the harness. |
| `E2E_AGENT_EMAIL`, `E2E_AGENT_PASSWORD` | secret | Disposable AGENT account of that stack; created and set up by the harness. |
| `E2E_DATABASE_URL` | secret | Postgres of that stack (same database as the API), used only to clear the super admin's MFA. **The host must resolve from a GitHub runner** — see *Database reachability* below. The workflow also accepts a secret named `DATABASE_URL` as a fallback. |
| `E2E_SUPERADMIN_TOTP_SECRET` | secret (optional) | Base32 TOTP secret of the test super admin. With it the run does not need database access at all (no MFA reset). |
| `E2E_SSH_HOST`, `E2E_SSH_PORT`, `E2E_SSH_USER`, `E2E_SSH_PRIVATE_KEY`, `E2E_SSH_DB_PORT` | secrets (optional) | With all of them set, the runner opens an SSH tunnel `127.0.0.1:15432 → <host>:<db port>` before the specs, so Postgres never has to be public. Then `E2E_DATABASE_URL` must point at `127.0.0.1:15432`. |
| `E2E_INSTALL_TOKEN` | secret | Only if the stack's install wizard is still open; must match the backend `INSTALL_TOKEN`. |

Steps (repository admin):

1. GitHub → repository → **Settings → Secrets and variables → Actions**.
2. **Variables** tab → *New repository variable*: add `E2E_API_URL`, `E2E_BASE_URL`.
3. **Secrets** tab → *New repository secret*: add the secrets from the table (use disposable
   `e2e.*@example.com` accounts for user/agent; the passwords must satisfy the local password policy —
   see *Test accounts* below).
4. Run the workflow on `master` (or *Run workflow*), open **Preflight** and check that it did not fail with
   `E2E did not run` or `E2E stack unreachable`. Failures upload `playwright-report/` as the job artifact.

> **Repository, not environment.** `E2E_API_URL` and `E2E_BASE_URL` must be **repository variables**
> (Settings → Secrets and variables → Actions → **Variables**). A variable created under
> *Settings → Environments* is visible only to a job that declares that environment, and this job does not,
> so `${{ vars.E2E_API_URL }}` would be an empty string and Preflight fails with `E2E did not run`.

The stack must be reachable from GitHub-hosted runners (public HTTPS or a tunnel on the runner). Specs that
depend on scheduled jobs (for example the 15-minute flush of article views) behave differently when the worker
is not running next to the API.

### Database reachability (why the job can fail with `getaddrinfo EAI_AGAIN`)

`global-setup` clears the test super admin's MFA through `E2E_DATABASE_URL`. That host is resolved **on the
GitHub runner**, which has no route into the stack's Docker network: an internal Coolify/Docker name (a bare
26-character service id such as `hgpchekxb6dutalsyctu42al`) fails with
`Error: getaddrinfo EAI_AGAIN <host>` before a single spec starts. Pick one:

| Option | What to do | Trade-off |
|---|---|---|
| **Public Postgres port** | In Coolify, publish the Postgres port and put it into `E2E_DATABASE_URL` (public host + port, same credentials). | The database is reachable from the internet; protect it with a strong password and, if possible, an allow-list. |
| **SSH tunnel** | Set `E2E_SSH_*` (see the table) and point `E2E_DATABASE_URL` at `127.0.0.1:15432`; the job opens the tunnel itself. | Nothing has to be public; the runner needs an SSH key that may only forward ports. |
| **No database** | Leave `E2E_DATABASE_URL` empty and set `E2E_SUPERADMIN_TOTP_SECRET` for the account. | No DB exposure, but MFA cannot be reset between runs — the secret must stay valid. |

When the database is configured but unreachable, the harness now prints this instead of the bare DNS error,
and **continues** only if `E2E_SUPERADMIN_TOTP_SECRET` is present (otherwise it stops with the same text):

```
[e2e] MFA reset skipped: the host "<host>" does not resolve from a GitHub-hosted runner.
  Set E2E_DATABASE_URL to a connection string that is reachable from GitHub runners: …
```

### Triage: reading a red run

Every run now writes `results.json` and prints a compact summary at the end, so the reason is in the log even
before the artifact is opened:

```
Playwright (results.json): 58 passed, 10 failed, 2 flaky, 0 skipped.

FAIL 20-privacy.spec.ts:41 — 20 privacy › a DSR travels the list and the timeline
     Error: expect(received).toMatch(expected)
       Expected pattern: /^\[HD-2026-000123\] /
       Received string:  "[HD-2026-000124] Nova poruka"

SKIPPED 1 test(s) — a skip is not a pass:
     18 scheduled reports › send test to me needs a configured e-mail channel
```

- The failure block is deliberately longer than one line: Playwright keeps `Expected`/`Received`, the axe rule
  list and the wrapped `cause` on the following lines, and those are usually the whole answer
  (`e2e/scripts/summarize-playwright-json.mjs`, `errorDetail`). Output is capped at 15 lines per failure.
- **A skip is printed too** (`collectSkipped`): a spec that skips itself on a stack without SMTP must not look
  like coverage. A skip still means the step was *not* verified.
- **Artifacts** (`playwright-report`, `test-results`, `results.json`) are uploaded on every run, also on failure;
  `test-results` holds the traces of failed attempts (`trace: 'on-first-retry'`).
- **Retry policy** (`ApiClient.send`): a `GET` is always repeated once (2 s apart), and **any method** is repeated
  when the connection never opened (`UND_ERR_CONNECT_TIMEOUT`, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, …) — a
  request that never reached the API cannot have written anything. A reset after sending is never repeated for a
  write. Specs 23 and 24 were lost to a 10 s connect timeout on `POST /auth/login` in the 2026-10-05 run.
- A network-level failure is never a bare `TypeError: fetch failed` any more: `ApiClient` (`send`) raises
  `NETWORK <METHOD> <path> failed: … (cause: ECONNREFUSED …) — the API at <url> was not reachable from the
  runner.` An **idempotent `GET` is retried once** (2 s apart), because the e2e job runs against a live stack
  that can be redeploying at that moment; writes are never retried.
- **Triage mode** (Actions → CI → *Run workflow*): `max_failures=8` stops after eight failures and `retries=0`
  does not retry them. A red run then takes a few minutes instead of ~35; the defaults (`0` / `1`) keep the full,
  strict run.
- **Dialogs: click the button, not its position.** `ModalContent` renders the X close button *after* the footer
  (`frontend/src/components/ui/modal.tsx`), so `getByRole('button').last()` inside a dialog clicks **close**. Use
  `getByTestId('confirm-dialog-confirm')` (or `'confirm-dialog-cancel'`) — spec 14 failed on every run until it did.
- **Heavy specs own their budget.** A spec that does several axe scans, opens a second browser context or signs in
  more than twice calls `test.slow()` (3× the global 90 s) and logs `phase()` markers, so a timeout says *where* the
  time went — spec 23 timed out at the global limit and specs 20/23 set their own budget.
- **Narrow the run**: the `specs` input takes comma-separated spec numbers, e.g. `specs=10,18,22`, and runs only
  `e2e/tests/10-*.spec.ts`, `18-*` and `22-*` (global setup still runs, so accounts and the install are prepared).
  An unknown number fails the step with `Unknown spec` instead of quietly running everything. Use it to re-check a
  fix in ~2 minutes instead of a full pass — the summary prints the line ready to copy:
  `NEXT TRIAGE RUN: specs=15,22 (…)`.
- **Classify before fixing.** Each failure belongs to one of three groups: **(A) environment** — an add-on, SMTP
  or a permission is missing on that stack, so the spec (or the stack) must be adjusted; **(B) spec assumption**
  — the screen/API changed on purpose and the spec still expects the old shape; **(C) product bug** — the spec is
  right and the code is wrong. The fix differs completely, so the first pass records the group, not the patch.
- **The organizational-unit scope is a query parameter, not a header.** `ReportsController` carries
  `@RequireOrganizationalUnitScope` for the whole controller (`backend/src/modules/reports/reports.controller.ts`), so
  *every* reports call — including the pack *list* — must carry the unit:
  `/reports/packs?organizationalUnitId=<id>`. Without it the guard answers `FORBIDDEN` and the failing call looks like
  a product bug. Specs 29/30 show the correct shape; spec 14 failed on exactly this (2026-10-05).
- **Never swallow a response with `.catch(() => null)` in an assertion.** Spec 23 wrapped the pack list that way, so
  the `FORBIDDEN` above turned into a *passed* assertion — silent loss of coverage. If a call cannot be made
  conditional, let it fail loudly and fix the request instead.
- Numbers in the file names (`20-privacy.spec.ts`) are the spec numbers; the `list` reporter prints them the same
  way, so a list like `10, 11, 12` maps straight onto files.

## State the suite owns and must reset

A run is executed against a **live** stack that people also use, so tests must not inherit what an earlier run (or a
person clicking around) left behind. Two rules, both learned from real failures on 2026-10-05:

- **Running timers are cleared by `globalSetup`** (`clearStaleTimers`, `helpers/time-tracking.ts` → `stopRunningTimer`,
  `GET /me/active-timer` + `POST …/stop`). Only one timer may run per agent, so a timer left by a failed run makes the
  *next* run's first `time-start` open the switch dialog and the header keep the old ticket number — a failure that
  looks like broken time tracking but is stale state. Spec 14 also clears its own timer, so a retry cannot inherit
  the timer its own failed attempt left.
- **A spec that depends on a setting pins it** for the duration of the test and restores it (`withSettings`,
  `helpers/assets.ts`), instead of assuming how the installation is configured. Spec 10 does this for
  `private.ticket.autoAssign.enabled` (a forward deliberately applies the target group's auto-assign strategy) and
  `private.ticket.groupInbox.enabled` (the flow needs an unassigned ticket in the group inbox).

## Test accounts (important)

`global-setup` changes the configured accounts:

- it **overwrites the password** of `E2E_USER_EMAIL` and `E2E_AGENT_EMAIL` through the API (admin
  reset → temporary password → forced change), only when the configured password does not work;
- with `DATABASE_URL` set, it **deletes the MFA** of `E2E_SUPERADMIN_EMAIL`, so the next login
  re-enrols it. The TOTP secrets exist only in `.auth/mfa.json` — or, when the database is not reachable,
  in the `E2E_SUPERADMIN_TOTP_SECRET` secret.

Use the reserved domain **`example.com`** (RFC 2606) for all three, e.g. `e2e.user@example.com`. No
real mailbox exists and the e-mail policy does not deliver there, so no mail leaves the system and the
temporary password is returned to the harness instead of being e-mailed. Do not add `example.com` to
the allowed e-mail domains.

So these must be disposable test accounts. The harness refuses any address whose local part does not start
with `e2e.` (for example `e2e.superadmin@example.com`), unless that address is listed on purpose in
`E2E_ALLOW_REAL_ACCOUNTS` (comma-separated).

On an already installed environment, create the super admin once in the UI: *Korisnici → Novi*, role
SUPER_ADMIN, local password = `E2E_SUPERADMIN_PASSWORD`. USER and AGENT are created by the harness.

The founder account obeys the same policy as every other local password (paket 5.1, `M1 #1`): at least
`private.auth.password.minLength` characters (12 by default), not on the common-password list, without the
product/organisation words and without parts of its own e-mail address. A password that fails is refused with
`400 PASSWORD_POLICY_VIOLATIONS` together with the list of broken rules — the install wizard shows that list and
the current minimum, so check it there before re-running a failed `POST /install/super-admin`.

The harness sets the USER/AGENT passwords through `POST /auth/change-password`, so they must satisfy the local
password policy (`backend/src/modules/authentication/security/password-policy.ts`): at least 12 characters, not
on the common-password list, without the product/organisation words and **without any part of the account's own
e-mail address** (a local part is split on `.`, `_`, `-`; every part of 4+ characters must not appear). An
address-derived password such as `ChangeMeE2eUser1!` for `e2e.user@example.com` is refused with
`CONTAINS_EMAIL_NAME`, which fails global setup before the first spec.
