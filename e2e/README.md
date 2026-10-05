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

The job first typechecks this project (`npx tsc --noEmit -p tsconfig.json`), then runs `npm test`.

> **A green E2E job now means the specs ran.** When the repository variable `E2E_API_URL` is empty the run
> step fails with `::error title=E2E did not run`, instead of silently passing (the earlier `exit 0` skip made a
> green checkmark meaningless). Configure the variables and secrets below before relying on this job.

### What the job needs: repository variables and secrets

| Name | Kind | Purpose |
|---|---|---|
| `E2E_API_URL` | variable | Base URL of the stack API (e.g. `https://api.desk.ba101.top`). **Empty → the job fails with `E2E did not run`.** |
| `E2E_BASE_URL` | variable | Frontend base URL (e.g. `https://desk.ba101.top`); defaults to `http://localhost:5173`. |
| `E2E_SUPERADMIN_EMAIL`, `E2E_SUPERADMIN_PASSWORD` | secret | Super admin that already exists on that stack; the harness only signs in (and clears MFA when `E2E_DATABASE_URL` is set). |
| `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` | secret | Disposable USER account of that stack; created and set up by the harness. |
| `E2E_AGENT_EMAIL`, `E2E_AGENT_PASSWORD` | secret | Disposable AGENT account of that stack; created and set up by the harness. |
| `E2E_DATABASE_URL` | secret | Postgres of that stack (same database as the API), used only to clear the super admin's MFA. |
| `E2E_INSTALL_TOKEN` | secret | Only if the stack's install wizard is still open; must match the backend `INSTALL_TOKEN`. |

Steps (repository admin):

1. GitHub → repository → **Settings → Secrets and variables → Actions**.
2. **Variables** tab → *New repository variable*: add `E2E_API_URL`, `E2E_BASE_URL`.
3. **Secrets** tab → *New repository secret*: add the eight secrets from the table (use disposable
   `e2e.*@example.com` accounts for user/agent; the passwords must satisfy the local password policy —
   see *Test accounts* below).
4. Run the workflow on `master` (or *Run workflow*), open the **Run E2E** step and check that it did not fail
   with `E2E did not run`. Failures upload `playwright-report/` as the job artifact.

The stack must be reachable from GitHub-hosted runners (public HTTPS or a tunnel on the runner). Specs that
depend on scheduled jobs (for example the 15-minute flush of article views) behave differently when the worker
is not running next to the API.

## Test accounts (important)

`global-setup` changes the configured accounts:

- it **overwrites the password** of `E2E_USER_EMAIL` and `E2E_AGENT_EMAIL` through the API (admin
  reset → temporary password → forced change), only when the configured password does not work;
- with `DATABASE_URL` set, it **deletes the MFA** of `E2E_SUPERADMIN_EMAIL`, so the next login
  re-enrols it. The TOTP secrets exist only in `.auth/mfa.json`.

Use the reserved domain **`example.com`** (RFC 2606) for all three, e.g. `e2e.user@example.com`. No
real mailbox exists and the e-mail policy does not deliver there, so no mail leaves the system and the
temporary password is returned to the harness instead of being e-mailed. Do not add `example.com` to
the allowed e-mail domains.

So these must be disposable test accounts. The harness refuses any address whose local part does not start
with `e2e.` (for example `e2e.superadmin@example.com`), unless that address is listed on purpose in
`E2E_ALLOW_REAL_ACCOUNTS` (comma-separated).

On an already installed environment, create the super admin once in the UI: *Korisnici → Novi*, role
SUPER_ADMIN, local password = `E2E_SUPERADMIN_PASSWORD`. USER and AGENT are created by the harness.

The harness sets the USER/AGENT passwords through `POST /auth/change-password`, so they must satisfy the local
password policy (`backend/src/modules/authentication/security/password-policy.ts`): at least 12 characters, not
on the common-password list, without the product/organisation words and **without any part of the account's own
e-mail address** (a local part is split on `.`, `_`, `-`; every part of 4+ characters must not appear). An
address-derived password such as `ChangeMeE2eUser1!` for `e2e.user@example.com` is refused with
`CONTAINS_EMAIL_NAME`, which fails global setup before the first spec.
