# Runbook (Dev)

**Analysis Date:** 2026-04-27

## What can run today (from this repo snapshot)

This repository is a **template skeleton**: infra + manifests exist, but application source code is not present in `backend/`, `frontend/`, or `mobile/`. As a result, builds/starts may not succeed beyond container build stubs.

Evidence:
- Backend has no `backend/src/` (only `backend/package.json`, `backend/Dockerfile`, `backend/.env*`).
- Frontend has no `frontend/src/` (only `frontend/package.json`, `frontend/Dockerfile`, `frontend/nginx.conf`, `.env*`).
- Mobile has no route tree (no `mobile/app/` directory; only `mobile/package.json`, `mobile/.env.example`).

## Initialize env files (required)

Generates `.env`, `backend/.env`, `frontend/.env` from prompts:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-project.ps1
```

Evidence: `scripts/init-project.ps1`, `README.md`.

## Docker Compose (frontend + backend behind Traefik)

The compose file expects an **external** Traefik network and uses Traefik labels for routing.

```powershell
docker compose up -d --build
```

Evidence: `docker-compose.yml`, `scripts/init-project.ps1` (prints this command).

### Prerequisites

- External Docker network exists: `${TRAEFIK_NETWORK}`: `docker-compose.yml`
- Env vars exist in root `.env` (created by init script): `.env.example`, `scripts/init-project.ps1`

## Running apps outside Docker (intended)

### Backend

```powershell
cd backend
npm install
npm run start:dev
```

Notes:
- Will require real Nest entrypoint at `backend/src/main.ts` and build output `dist/src/main.js`: `backend/Dockerfile`
- Prisma commands exist but require `backend/prisma/schema.prisma`: `backend/package.json`

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Notes:
- Requires Vite app source (`frontend/src/`) which is not present in this repo snapshot: `frontend/package.json`

### Mobile

```powershell
cd mobile
npm install
npm run start
```

Notes:
- Requires Expo app/router source which is not present in this repo snapshot: `mobile/package.json`

## Environment Variables (current examples)

### Root (`.env`)

Template keys:
- `PROJECT_NAME`, `TRAEFIK_STACK`, `TRAEFIK_HOST`, `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT`, `TRAEFIK_TLS`
- `BACKEND_PATH_PREFIX`, `UPLOADS_HOST_DIR`

Evidence: `.env.example`, `scripts/init-project.ps1`, `docker-compose.yml`.

### Backend (`backend/.env`)

Template keys:
- `DATABASE_URL` (mysql connection string)
- `PORT`
- `UPLOAD_ROOT`

Evidence: `backend/.env.example`, `scripts/init-project.ps1`.

### Frontend (`frontend/.env`)

Template keys:
- `VITE_API_BASE_URL`

Evidence: `frontend/.env.example`, `scripts/init-project.ps1`.

### Mobile (`mobile/.env`)

Template keys:
- `EXPO_PUBLIC_API_BASE_URL`

Evidence: `mobile/.env.example`.

## Common failure modes (with this repo snapshot)

- Backend container may fail at runtime because `dist/src/main.js` does not exist: `backend/Dockerfile`
- Frontend build is stubbed to not fail the image build (`npm run build || true`), but runtime will serve whatever is in `dist/` (likely empty): `frontend/Dockerfile`
- Prisma generate is stubbed (`npx prisma generate || true`) but `prisma/` directory is missing: `backend/Dockerfile`

---

*Runbook: 2026-04-27*
