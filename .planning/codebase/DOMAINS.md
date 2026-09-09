# Domains / Modules

**Analysis Date:** 2026-04-27

## Current Domains Implemented

**None detected.**

Evidence: no application source trees were detected:
- Backend has no `backend/src/` (only `backend/package.json`, `backend/Dockerfile`, `backend/.env*`).
- Frontend has no `frontend/src/` (only infra/env files).

## Intended Domains (based on declared dependencies + repo policy docs)

These are *intended* modules implied by manifests and `.cursor` docs, but are not implemented in code in this repo snapshot.

**Backend (NestJS):**
- **Auth** (JWT + Passport + bcrypt): `backend/package.json`
- **Settings** (public/private settings contract): `.cursor/docs/settings-contract.md`
- **Notifications (in-app)** baseline: `.cursor/docs/notifications.md`
- **Uploads** (multer + sharp + UPLOAD_ROOT): `backend/package.json`, `backend/.env.example`
- **Realtime** (Socket.IO): `backend/package.json`, `.cursor/rules/design-settings-realtime-notifications.mdc`
- **Scheduler/cron** (Nest schedule): `backend/package.json`

**Frontend (React SPA):**
- **App shell + routing** (React Router): `frontend/package.json`
- **State management** (Zustand): `frontend/package.json`
- **Data fetching** (React Query + axios): `frontend/package.json`
- **Realtime consumption** (socket.io-client): `frontend/package.json`
- **i18n** (i18next): `frontend/package.json`

## Where domains would live (conventions to follow when code is added)

**Backend:**
- Nest modules under `backend/src/modules/<domain>/...` (not present; proposed placement only)
- Prisma schema under `backend/prisma/schema.prisma` (not present; Dockerfile expects `prisma/`)

**Frontend:**
- Feature areas under `frontend/src/features/<domain>/...` (not present; proposed placement only)

---

*Domains map: 2026-04-27*
