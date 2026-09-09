# Database / Prisma

**Analysis Date:** 2026-04-27

## Prisma Setup (current state)

**Prisma schema:** Not detected.
- Expected path (convention): `backend/prisma/schema.prisma`
- Actual detection: no `schema.prisma` found anywhere in repo; no `backend/prisma/` directory exists.

**Migrations:** Not detected.
- Expected path (convention): `backend/prisma/migrations/`
- Actual detection: no `migrations/` directory exists under backend or elsewhere.

**Prisma tooling (declared):**
- CLI: `prisma ^7.5.0` (devDependency): `backend/package.json`
- Client: `@prisma/client ^7.5.0`: `backend/package.json`
- MariaDB adapter: `@prisma/adapter-mariadb ^7.5.0`: `backend/package.json`
- DB driver: `mariadb ^3.5.2`: `backend/package.json`

**DB connection env:**
- `DATABASE_URL` (mysql): `backend/.env.example`

## Seed / Migrate Commands (declared scripts)

Declared in `backend/package.json` (may fail until Prisma schema and Nest app exist):
- `npm run db:generate` → `prisma generate`
- `npm run db:migrate` → `prisma migrate deploy`
- `npm run db:seed` → `prisma db seed`
- `npm run db:init` → `prisma migrate deploy && prisma db seed`

## Data Model / Key Models

**Not implemented yet.**
- No Prisma models can be documented without `schema.prisma`.

## Storage and Upload Paths

Even though DB schema is missing, uploads are wired at the container level:
- Upload root env: `UPLOAD_ROOT`: `backend/.env.example`
- Host volume mount: `${UPLOADS_HOST_DIR}:/usr/app/uploads`: `docker-compose.yml`

---

*Database inventory: 2026-04-27*
