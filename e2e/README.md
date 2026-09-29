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

`global-setup` ensures install when needed, then provisions local USER/AGENT via Prisma (`DATABASE_URL`) with bcrypt password hashes. No new production User-password API.

## CI

Unit gate is `.github/workflows/ci.yml` (backend + frontend). E2E is a **separate** job on `workflow_dispatch` / `main` that expects a live stack — it does not start Postgres/Redis in GitHub-hosted runners (Coolify contract). See `HANDOFF.md`.

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
