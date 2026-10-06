# Coolify deploy (Service Desk)

Repo ne sadrži `.env`. Sve ključeve iz `.env.example` zalijepi u Coolify → Environment (i Build Argument za `VITE_API_BASE_URL`).

## Obavijest o neuspješnom deployu (obavezno)

Coolify → **Notifications** → izabrati kanal (email, Discord, Slack/Mattermost ili webhook) → uključiti
**Enabled** i označiti događaj **Deployment failed** (uz „Deployment success" po želji), pa poslati testnu
obavijest. Bez toga se neuspješan deploy vidi samo onome ko otvori Coolify.

Auto-deploy na push ostaje uključen. Ono što **ne** treba raditi: oslanjati se na to da e2e na `master` uhvati
neuspješan deploy — u trenutku izvršavanja stack je već rebuildan (vidi `docs/plans/CI-KVALITETNA-KAPIJA.md` §2).
Opciono, i neoslonjeno na provjeru iz ovog repoa: „Watch Paths" može preskočiti build za docs-only commit.

## Resursi izvan ovog compose-a

- **PostgreSQL**: Coolify Database. Connection string → `DATABASE_URL`. Backup/retention na DB resursu.
- **Redis**: postojeći kontejner `redis-core` na external mreži `redis_net` (compose ime; RAW kaže `redis-net`).
- ACL user `servicedesk`: sadržaj `ops/redis-acl.line`. Lozinka iza `>` = `REDIS_PASSWORD`. `+info` mora biti poslije `-@dangerous`.
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
  `servicedesk:`. Ako se doda Socket.IO namespace (npr. `/admin`), u ACL mora ući i
  njegov literalni pattern (`&socket.io#/admin#*`).
- Ne koristiti lozinku Coolify Redis `default` usera osim ako je to i lozinka ACL usera `servicedesk`. `WRONGPASS` = username/password par nije taj ACL user.

## Coolify projekat

1. Compose: `docker-compose.yml` (bez Traefik labela).
2. Poveži servise `backend` i `worker` na mrežu `redis_net`. Isti `REDIS_HOST` / `REDIS_USERNAME` / `REDIS_PASSWORD` na oba (compose `x-redis-environment`).
3. FQDN: frontend → `desk.ba101.top` (prod kasnije `desk.example.com`); backend → `api.desk.ba101.top`. Worker **bez** FQDN.
4. Socket.IO: na API FQDN uključi WebSocket upgrade.
5. Persistent storage: mount na `/usr/app/uploads` za backend **i** worker (isti volume).
6. Healthcheck: definisan u `docker-compose.yml`, Coolify ga preuzima. Ne upisujte poseban
   healthcheck u Coolify UI, jer bi pregazio ovaj.

   | Servis | Provjera | Znači |
   |---|---|---|
   | frontend | `wget http://127.0.0.1:10000/` svakih 30 s | nginx servira SPA |
   | backend | `GET /health/ready` svakih 15 s, start 120 s | baza i Redis dostupni (503 = nisu) |
   | worker | `node dist/src/cli/worker-health.js` svakih 30 s | heartbeat u Redisu mlađi od 120 s |

   Endpointi (javni, bez prijave):
   - `/health`: liveness (proces živ), uvijek 200;
   - `/health/ready`: readiness (baza i Redis); 503 s tijelom koje pokazuje koji check pada;
   - `/health/worker`: 200 ako je worker javio heartbeat u zadnjih 120 s, inače 503.

   Gdje se vidi *healthy*: Coolify → projekat → servis (zelena oznaka `running (healthy)`) ili
   `docker ps` (kolona STATUS). **Traefik ne rutira na kontejner koji nije healthy.** Zato kod
   neispravne baze API vraća 502/404, a ne 500. Stanje aplikacije u cjelini je u Admin →
   **Zdravlje sistema**. Eksterni nadzor opisuje [`monitoring/uptime-kuma.md`](monitoring/uptime-kuma.md).
7. Worker env `OPS_UPTIME_PUSH_URL` (opciono): dead man's switch prema Uptime Kumi, vidi
   `monitoring/uptime-kuma.md` §4.

## Build

- Frontend image: build-arg `VITE_API_BASE_URL=$API_PUBLIC_URL`. Runtime env na nginx kontejneru ne mijenja već ugrađeni SPA.
- Backend i worker: ista Dockerfile (`backend/Dockerfile`). Worker override command: `node dist/src/worker.js`.
- Backend command: `npx prisma migrate deploy && node dist/src/main.js`.

## Redoslijed

1. Redis ACL linija na hostu — `>` lozinka = Coolify `REDIS_PASSWORD`, user `servicedesk`.  
2. Postgres baza + `DATABASE_URL`.  
3. Env iz `.env.example` (`REDIS_USERNAME=servicedesk`, ista lozinka na backend i worker).  
4. Deploy compose.  
5. Otvori app → **install wizard** (nije Coolify korak).

Staging (`ba101.top`) i prod (`example.com`) dijele iste ključeve, različite vrijednosti.
