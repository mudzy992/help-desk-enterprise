# Coolify deploy (EP-HelpDesk)

Repo ne sadrži `.env`. Sve ključeve iz `.env.example` zalijepi u Coolify → Environment (i Build Argument za `VITE_API_BASE_URL`).

## Resursi izvan ovog compose-a

- **PostgreSQL**: Coolify Database. Connection string → `DATABASE_URL`. Backup/retention na DB resursu.
- **Redis**: postojeći kontejner `redis-core` na external mreži `redis_net` (compose ime; RAW kaže `redis-net`).
- ACL user `ephelpdesk`: sadržaj `ops/redis-acl.line`. Lozinka iza `>` = `REDIS_PASSWORD`. `+info` mora biti poslije `-@dangerous`.
- **Kanali (F3.1/F4)** — Redis razlikuje dva slučaja i to je jedina zamka ovdje:
  - `PUBLISH` i `SUBSCRIBE` se poklapaju s dozvoljenim **globom** (`&socket.io#*` pokriva
    `socket.io#/#room#` i `socket.io-request#/#`),
  - `PSUBSCRIBE` zahtijeva **literalno poklapanje** patterna, pa `&socket.io#*` **ne**
    pokriva `socket.io#/#*` — taj string mora stajati u ACL-u doslovno.
  Zato linija sadrži i `&socket.io#/#*` (adapter), `&socket.io-request#*` /
  `&socket.io-response#*` (zahtjev/odgovor kanali), `&tickets:realtime-bridge`
  (F4 worker→API most) i `&integration-queue:*` (edge realtime). Bez njih API boota
  degradirano (`ws_adapter_redis_acl_denied`, in-memory adapter) — a prije F4 dopune
  je padao s `NOPERM No permissions to access a channel`.
  Kanali se **ne** prefiksiraju `REDIS_KEY_PREFIX`-om, zato `socket.io…` stoji bez
  `ephelpdesk:`. Ako se doda Socket.IO namespace (npr. `/admin`), u ACL mora ući i
  njegov literalni pattern (`&socket.io#/admin#*`).
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
