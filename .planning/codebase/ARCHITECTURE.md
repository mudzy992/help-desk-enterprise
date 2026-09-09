# Architecture

**Analysis Date:** 2026-04-27

## Pattern Overview

**Overall:** Monorepo template with three apps (`backend/`, `frontend/`, `mobile/`) and Docker/Traefik deployment wiring.

**Key Characteristics:**
- App manifests and infra wiring exist; application source code is not present in this repository snapshot.
- Backend is intended to be a NestJS + Prisma API with optional Socket.IO realtime.
- Frontend is intended to be a Vite SPA served by Nginx.

## High-level Diagram (text)

```
             +----------------------+
             |   Traefik (external) |
             | network: ${TRAEFIK_NETWORK}
             +----------+-----------+
                        |
        Host(${TRAEFIK_HOST}) + PathPrefix(${BACKEND_PATH_PREFIX})
                        |
           +------------+------------+
           |                         |
   +-------v--------+        +-------v--------+
   | frontend       |        | backend        |
   | Nginx :10000   |        | Node :10001    |
   | ./frontend     |        | ./backend      |
   +----------------+        +----------------+
                                      |
                                      | MariaDB/MySQL (intended)
                                      | DATABASE_URL
                                      v
                                (Not implemented in repo)
```

Evidence: `docker-compose.yml`, `frontend/nginx.conf`, `backend/.env.example`.

## Layers

**Infrastructure / Deployment:**
- Purpose: Container build and runtime wiring, routing via Traefik.
- Location: `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`
- Contains: service definitions, labels, ports, external network.

**Backend (intended; code not present):**
- Purpose: REST API + auth + file uploads + realtime (Socket.IO).
- Location: `backend/` (only `package.json`, env files, and `Dockerfile` exist)
- Depends on: Prisma client + MariaDB adapter, NestJS modules, Passport/JWT.
- Evidence of intent: `backend/package.json`, `backend/Dockerfile`, `backend/.env.example`

**Frontend (intended; code not present):**
- Purpose: SPA consuming backend API and (optionally) Socket.IO.
- Location: `frontend/` (no `src/` detected; infra files only)
- Evidence of intent: `frontend/package.json`, `frontend/.env.example`, `frontend/Dockerfile`

**Mobile (intended; code not present):**
- Purpose: Expo Router app consuming backend API; secure storage; push notifications.
- Location: `mobile/` (no app source detected; `package.json` + `.env.example` only)
- Evidence of intent: `mobile/package.json`, `mobile/.env.example`

## Data Flow

**Web SPA → API (intended):**
1. Frontend reads API base URL from `VITE_API_BASE_URL`: `frontend/.env.example`
2. Frontend calls backend endpoints via `axios` / React Query (declared): `frontend/package.json`
3. Backend uses `DATABASE_URL` to talk to DB via Prisma (declared): `backend/.env.example`, `backend/package.json`

**Mobile → API (intended):**
1. Mobile reads base URL from `EXPO_PUBLIC_API_BASE_URL`: `mobile/.env.example`
2. Mobile calls backend via `axios` (declared): `mobile/package.json`
3. Secure tokens are expected to be stored using `expo-secure-store` (declared): `mobile/package.json`

## Key Abstractions

**Settings contract & notifications baseline (repo policy docs, not implementation):**
- Purpose: defines expected settings registry and in-app notifications behavior.
- Location: `.cursor/docs/settings-contract.md`, `.cursor/docs/notifications.md`
- Realtime policy docs: `.cursor/rules/design-settings-realtime-notifications.mdc`

## Entry Points

**Init / environment generation:**
- Location: `scripts/init-project.ps1`
- Responsibilities: writes `.env`, `backend/.env`, `frontend/.env` using prompts; creates `.cursor/docs/theme.md` if missing.

**Docker Compose runtime:**
- Location: `docker-compose.yml`
- Responsibilities: builds backend/frontend images; attaches to external Traefik network; routes host/path to services.

## Error Handling

**Strategy:** Not implemented (backend/frontend/mobile source code absent).

## Cross-Cutting Concerns

**Authentication:** Declared via Nest JWT/Passport dependencies, but not implemented in repo: `backend/package.json`
**Validation:** Declared via `class-validator`/`class-transformer`, but not implemented in repo: `backend/package.json`
**Uploads:** Env key and volume mount exist; API not implemented in repo: `backend/.env.example`, `docker-compose.yml`
**Realtime:** Socket.IO deps declared; gateway/client code not present: `backend/package.json`, `frontend/package.json`

---

*Architecture analysis: 2026-04-27*
