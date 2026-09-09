# Coolify deploy (EP-HelpDesk)

Repo ne sadrži `.env`. Sve ključeve iz `.env.example` zalijepi u Coolify → Environment (i Build Argument za `VITE_API_BASE_URL`).

## Resursi izvan ovog compose-a

- **PostgreSQL**: Coolify Database. Connection string → `DATABASE_URL`. Backup/retention na DB resursu.
- **Redis**: postojeći kontejner `redis-core` na external mreži `redis-net`.
- ACL user: sadržaj `ops/redis-acl.line` ubaci u host `deploy.sh` (password iz secreta, zamijeni `CHANGE_ME`).

## Coolify projekat

1. Compose: `docker-compose.yml` (bez Traefik labela).
2. Poveži servise `backend` i `worker` na mrežu `redis-net`.
3. FQDN: frontend → `desk.ba101.top` (prod kasnije `desk.epbih.ba`); backend → `api.desk.ba101.top`. Worker **bez** FQDN.
4. Socket.IO: na API FQDN uključi WebSocket upgrade.
5. Persistent storage: mount na `/usr/app/uploads` za backend **i** worker (isti volume).
6. Healthcheck URL: `https://api.…/health` (implementacija u Fazi 0).

## Build

- Frontend image: build-arg `VITE_API_BASE_URL=$API_PUBLIC_URL`. Runtime env na nginx kontejneru ne mijenja već ugrađeni SPA.
- Backend i worker: ista Dockerfile (`backend/Dockerfile`). Worker override command: `node dist/src/worker.js`.
- Backend command: `npx prisma migrate deploy && node dist/src/main.js`.

## Redoslijed

1. Redis ACL linija na hostu.  
2. Postgres baza + `DATABASE_URL`.  
3. Env iz `.env.example`.  
4. Deploy compose.  
5. Otvori app → **install wizard** (nije Coolify korak).

Staging (`ba101.top`) i prod (`epbih.ba`) dijele iste ključeve, različite vrijednosti.
