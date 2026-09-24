# Coolify deploy (EP-HelpDesk)

Repo ne sadrži `.env`. Sve ključeve iz `.env.example` zalijepi u Coolify → Environment (i Build Argument za `VITE_API_BASE_URL`).

## Resursi izvan ovog compose-a

- **PostgreSQL**: Coolify Database. Connection string → `DATABASE_URL`. Backup/retention na DB resursu.
- **Redis**: postojeći kontejner `redis-core` na external mreži `redis_net` (compose ime; RAW kaže `redis-net`).
- ACL user `ephelpdesk`: sadržaj `ops/redis-acl.line`. Lozinka iza `>` = `REDIS_PASSWORD`. `+info` mora biti poslije `-@dangerous`. Kanali: keyspace `&ephelpdesk:*` i `&bull:ephelpdesk:*` (keševi i BullMQ), `&integration-queue:*` (edge realtime), `&tickets:realtime-bridge` (F4 worker→API most) i **`&socket.io#*` `&socket.io-request#*` `&socket.io-response#*`** (F3.1 Redis adapter; bez ovih API pada na bootu s `NOPERM No permissions to access a channel` na `psubscribe socket.io#/#*`). Kanali se **ne** prefiksiraju `REDIS_KEY_PREFIX`-om — zato `socket.io…` stoji bez `ephelpdesk:`.
- Ne koristiti lozinku Coolify Redis `default` usera osim ako je to i lozinka ACL usera `ephelpdesk`. `WRONGPASS` = username/password par nije taj ACL user.

## Coolify projekat

1. Compose: `docker-compose.yml` (bez Traefik labela).
2. Poveži servise `backend` i `worker` na mrežu `redis_net`. Isti `REDIS_HOST` / `REDIS_USERNAME` / `REDIS_PASSWORD` na oba (compose `x-redis-environment`).
3. FQDN: frontend → `desk.ba101.top` (prod kasnije `desk.epbih.ba`); backend → `api.desk.ba101.top`. Worker **bez** FQDN.
4. Socket.IO: na API FQDN uključi WebSocket upgrade.
5. Persistent storage: mount na `/usr/app/uploads` za backend **i** worker (isti volume).
6. Healthcheck URL: `https://api.…/health` (implementacija u Fazi 0).

## Build

- Frontend image: build-arg `VITE_API_BASE_URL=$API_PUBLIC_URL`. Runtime env na nginx kontejneru ne mijenja već ugrađeni SPA.
- Backend i worker: ista Dockerfile (`backend/Dockerfile`). Worker override command: `node dist/src/worker.js`.
- Backend command: `npx prisma migrate deploy && node dist/src/main.js`.

## Redoslijed

1. Redis ACL linija na hostu — `>` lozinka = Coolify `REDIS_PASSWORD`, user `ephelpdesk`.  
2. Postgres baza + `DATABASE_URL`.  
3. Env iz `.env.example` (`REDIS_USERNAME=ephelpdesk`, ista lozinka na backend i worker).  
4. Deploy compose.  
5. Otvori app → **install wizard** (nije Coolify korak).

Staging (`ba101.top`) i prod (`epbih.ba`) dijele iste ključeve, različite vrijednosti.
