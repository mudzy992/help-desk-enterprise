# Infra — Coolify + PostgreSQL + Redis

Agent source of truth za deploy. Operator runbook: `ops/COOLIFY.md`. Env katalog: `.env.example`. Redis ACL: `ops/redis-acl.line`.

## Odluke

- **Postgres** (Coolify Database resource). Nije u app compose. Samo `DATABASE_URL`. Prisma 7 + `@prisma/adapter-pg`. KB pretraga: `tsvector`/GIN, ne MySQL FULLTEXT.
- **Coolify** proxy (HTTPS, FQDN). Bez Traefik labela, bez `/backend` prefixa.
- **Web**: `APP_PUBLIC_URL` (npr. `https://desk.ba101.top`). **API**: `API_PUBLIC_URL` (npr. `https://api.desk.ba101.top`). Vrijednosti samo kroz env.
- **Nema `.env` u gitu.** Coolify Environment = ključevi iz `.env.example`. `VITE_API_BASE_URL` je i **build arg** (Vite bake).
- **Redis**: host kontejner `redis-core`, mreža `redis_net` (external, compose). User `ephelpdesk`, scoped ACL (nije `+@all`). `REDIS_PASSWORD` na backend **i** worker = lozinka u `ops/redis-acl.line` (placeholder `change-me`).
- **BullMQ** izvršava poslove. **Postgres `IntegrationJob`** je admin UI / audit / retry. Worker je zaseban servis (ista backend image).
- **Uploads**: volume na backend + worker. U DB samo path.
- **Install wizard** ostaje app first-run (`.cursor/docs/04-install-wizard.md`); SMTP/auth/addon nisu Coolify-only.

## Servisi

| Servis | Public | Mreže | CMD |
|---|---|---|---|
| frontend | FQDN app | Coolify proxy | nginx :10000 |
| backend | FQDN api | proxy + redis_net | `prisma migrate deploy` pa API+Socket.IO :10001 |
| worker | nema | proxy (internal) + redis_net | `node dist/src/worker.js` |

Migracije samo na backend startu. Worker ne migrira.

## Zabranjeno

- Traefik labele, `BACKEND_PATH_PREFIX`, MySQL/MariaDB, `+@all` Redis ACL, committati `.env` / secreta.
- Pokretati jobove na HTTP procesu (SLA, email, edge) — to je worker.

Detalji: `ops/COOLIFY.md`.
