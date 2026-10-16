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

Declared in `backend/package.json`:
- `npm run db:generate` → `prisma generate`
- `npm run db:migrate` → `prisma migrate deploy`
- `npm run db:seed` → `node dist/src/seed-database.js` (compiled; run `npm run build` first)
- `npm run db:init` → `prisma migrate deploy && prisma generate && npm run build && node dist/src/seed-database.js`

The seed does **not** run through `ts-node`: the Prisma 7 `prisma-client` generator writes `.ts` files whose
imports carry `.js` specifiers, and ts-node cannot resolve those (`Cannot find module './internal/class.js'`).
Everything the wizard needs is seeded elsewhere anyway — SLA profiles and the priority matrix on backend boot
(`StartingSlaSeedService`), the rest in the wizard's own `seed` step — so a fresh install never depends on this
command. `prisma migrate reset` (Prisma 7) no longer runs seeds at all; `--skip-seed`/`--skip-generate` are gone.

## Data Model / Key Models

**Not implemented yet.**
- No Prisma models can be documented without `schema.prisma`.

## Storage and Upload Paths

Even though DB schema is missing, uploads are wired at the container level:
- Upload root env: `UPLOAD_ROOT`: `backend/.env.example`
- Host volume mount: `${UPLOADS_HOST_DIR}:/usr/app/uploads`: `docker-compose.yml`

---

*Database inventory: 2026-04-27*
