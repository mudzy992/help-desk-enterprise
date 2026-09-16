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
