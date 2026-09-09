# Technology Stack

**Analysis Date:** 2026-04-27

## Languages

**Primary:**
- TypeScript - intended across `backend/` and `frontend/` via their `package.json` files

**Secondary:**
- PowerShell - automation scripts in `scripts/*.ps1`

## Runtime

**Environment:**
- Node.js (container images use Node 22 Alpine): `backend/Dockerfile`, `frontend/Dockerfile`

**Package Manager:**
- npm (scripts use `npm ci || npm install`): `backend/Dockerfile`, `frontend/Dockerfile`
- Lockfile: not detected in repo root or app folders (no `package-lock.json` found via file inventory)

## Frameworks

**Backend (declared deps; application code not present):**
- NestJS `^11.x`: `backend/package.json`
- Prisma `^7.5.0`: `backend/package.json`
- Socket.IO server `^4.8.3` + Nest websockets/platform-socket.io: `backend/package.json`
- Auth libs: `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`: `backend/package.json`

**Frontend (declared deps; application code not present):**
- React `^18.3.1` + Vite `^5.4.2`: `frontend/package.json`
- Tailwind `^3.4.4`: `frontend/package.json`
- Radix UI (multiple packages): `frontend/package.json`
- Data fetching: `@tanstack/react-query`, `axios`: `frontend/package.json`
- Realtime client: `socket.io-client`: `frontend/package.json`
- State: `zustand`: `frontend/package.json`
- Routing: `react-router-dom`: `frontend/package.json`
- i18n: `i18next`, `react-i18next`: `frontend/package.json`

## Key Dependencies

**Critical (declared):**
- `@prisma/client` + `prisma`: `backend/package.json` (no `schema.prisma` detected in repo)
- `socket.io` + `socket.io-client`: `backend/package.json`, `frontend/package.json` (no gateways/clients detected in source because source folders are missing)

**Infrastructure / Ops:**
- Docker (compose + app Dockerfiles): `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`
- Traefik integration via labels and external network: `docker-compose.yml`
- Nginx static hosting for frontend: `frontend/nginx.conf`, `frontend/Dockerfile`

## Configuration

**Environment:**
- Root template env keys: `.env.example`
- Backend env keys: `backend/.env.example` (`DATABASE_URL`, `PORT`, `UPLOAD_ROOT`)
- Frontend env keys: `frontend/.env.example` (`VITE_API_BASE_URL`)
- Env generation script: `scripts/init-project.ps1`

**Build:**
- Backend build entrypoint expected: `dist/src/main.js` (stubbed build tolerated): `backend/Dockerfile`
- Frontend build output expected: `dist/` (build tolerated even if missing): `frontend/Dockerfile`

## Platform Requirements

**Development:**
- PowerShell to run init/bootstrap scripts: `scripts/init-project.ps1`, `scripts/bootstrap-cursor.ps1`
- Docker + external Traefik network (named by `${TRAEFIK_NETWORK}`): `docker-compose.yml`

**Production:**
- Containerized deployment via Docker Compose with Traefik routing: `docker-compose.yml`

---

*Stack analysis: 2026-04-27*
