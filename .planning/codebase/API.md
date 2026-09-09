# API Surface

**Analysis Date:** 2026-04-27

## Implemented Controllers / Routes

**Not detected.**

Evidence:
- No `backend/src/` directory present, so no Nest controllers (no `@Controller(...)` occurrences) can exist in this repo snapshot.
- Only backend files present: `backend/package.json`, `backend/Dockerfile`, `backend/.env`, `backend/.env.example`.

## Intended API Shape (inferred from infrastructure + deps)

This section lists expected API concerns implied by manifests and infra wiring; it is **not implemented** in this repo snapshot.

**Base URL / routing:**
- Backend is routed behind Traefik at `https://${TRAEFIK_HOST}${BACKEND_PATH_PREFIX}`: `docker-compose.yml`, `scripts/init-project.ps1`
- Local dev env examples point to `http://localhost:3000` for frontend/mobile base URL: `frontend/.env.example`, `mobile/.env.example`

**Auth (JWT):**
- Declared libs: `@nestjs/jwt`, `passport`, `passport-jwt`, `bcrypt`: `backend/package.json`
- Endpoints: Not implemented yet (no controllers).
- Expected auth mechanism: Bearer JWT via Passport strategy (inferred from deps).

**Uploads:**
- Declared libs: `multer`, `sharp`: `backend/package.json`
- Config keys: `UPLOAD_ROOT`: `backend/.env.example`
- Docker volume mount for uploads: `docker-compose.yml`
- Endpoints: Not implemented yet.

**Notifications / Settings / Realtime:**
- Policy docs exist (no code): `.cursor/docs/notifications.md`, `.cursor/docs/settings-contract.md`, `.cursor/rules/design-settings-realtime-notifications.mdc`
- Endpoints: Not implemented yet.

## Frontend & Mobile Consumption (implemented)

**Not detected** (no application source present in `frontend/` or `mobile/` beyond manifests).

Evidence:
- `frontend/` contains only `package.json`, `.env*`, `Dockerfile`, `nginx.conf`.
- `mobile/` contains only `package.json`, `.env.example`.

---

*API inventory: 2026-04-27*
