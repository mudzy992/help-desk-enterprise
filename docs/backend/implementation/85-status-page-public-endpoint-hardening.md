# W6.12 — Public status page endpoint hardening

**Paket:** Val 6 / W6.12  
**Nalazi:** `BA-status-page-13` (P2) — Public rate limit zavisi od trust-proxy/IP ispravnosti i fail-open je pri Redis grešci; `BA-status-page-14` (P2) — Process-local public cache nema mutation invalidation ni multi-instance koherenciju  
**SHA:** `6a719b9`  
**Finalni CI:** `40843156212` (kompletan backend, frontend, integracija, container gate, CI gate — zelen)  
**DB migracije:** nema nove migracije; koristi postojeći Redis, `Ticket`, `ServiceIncident`, `TicketIncidentLink` i outbox infrastrukturu.

## Problemi

**BA-status-page-13** — `PublicStatusPageController` je koristio `request.ip` direktno bez trust-proxy consciousnessa:
- Iza reverse proxya (Coolify/Traefik) svi korisnici dobiju isti IP (proxy IP) → rate limit neefektivan za pojedinačne klijente
- `X-Forwarded-For` se nije validirao, može se spiofovati
- Redis greška dovodila do `fail-open` (`catch { return; }`) — neograničeni pristup kada Redis padne

**BA-status-page-14** — `PublicStatusPageController` je koristio per-process `this.cached` Map:
- Svaka API instanca radi vlastiti DB refresh — do 30s stalošća između instanci
- Nema invalidacije kada se incident kreira/edituje/resolve/meni visibility
- Nema shared cache-a kroz Redis (iako Redis postoji u sistemu)

## Rešenje

### 1. Trust-proxy-aware IP extraction (`public-status-page.controller.ts`)

`clientIp()` koristi `request.ip` kada Express `trust proxy` je podešen (poštuje `X-Forwarded-For` kroz Express trust proxy mechanism), inače fallback na `socket.remoteAddress`. Lokalne adrese (`127.0.0.1`, `::1`, `unknown`) se tretiraju kao missing i padaju na socket adresu.

### 2. Rate limit fail-closed

Kada Redis nije dostupan, `limit()` baca `429 Too Many Requests` umesto `fail-open` propusta. Memory fallback (single instance bez Redisa) koristi bounded Map sa 10,000 IP capa i 60s prozorom.

### 3. Shared Redis cache (`status-page-public-cache.service.ts`)

Novi servis zamenjuje per-process `this.cached` Map sa Redis-baziranim shared cache-om:
- Ključ: `status:public:page:v{version}` gde je verzija `status:public:cache:version`
- TTL: 30s (isto kao ranije `publicCacheMs`)
- Graceful degradation: kada Redis nije dostupan, controller degrades na per-process recompute
- `getVersion()` / `bumpVersion()` upravljaju verzijom za invalidaciju

### 4. Cache invalidacija na incident mutaciji (`status-incidents.service.ts`)

`StatusIncidentsService` sada injektuje `StatusPagePublicCacheService` i poziva `await this.publicCache.bumpVersion()` nakon uspešno commitovanih mutacija:
- `create` — novi incident
- `edit` — promena title/impact/visibility/services
- `addUpdate` — nova timeline stavka ili status promena (uključujući RESOLVED)
- `linkTicket` / `unlinkTicket` — promena povezanih tiketa

Sve API instance koje čitate verziju nakon bumpa dobijaju novu cache miss i ponovo računaju iz baze.

## Idempotnost i bezbednost

- `bumpVersion()` je best-effort: kada Redis nije dostupan, baca se u ćuteci, instance se samootkupljuju unutar 30s TTL
- Cache verzija se samo inkrementira (nikada se ne dekrementira), nema rizika od kolizije
- Rate limit ključ `status:public-rate:{ip}` ima 60s TTL kroz Redis `EXPIRE`
- Memory fallback Map se briše kad prekorači 10,000 IP-a

## Testni dokazi

### Unit — `status-page-public-cache.service.spec.ts`

- `is disabled when no Redis client is provided`: `enabled === false`
- `getVersion reads and parses the version key from Redis`: vraća 7 za `"7"`
- `getVersion returns 0 when Redis value is not a number`: ne number → 0
- `getVersion returns 0 when Redis throws`: greška → 0
- `bumpVersion calls incr on the version key`: `incr('status:public:cache:version')`
- `bumpVersion does not throw when Redis throws`: greška se hvata
- `getPage reads the versioned page key from Redis`: ključ `status:public:page:v{version}`
- `setPage writes the versioned page key with TTL`: `EX 30`

### Unit — `public-status-page.controller.spec.ts` (`clientIp`)

- Realni `request.ip` se koristi kada nije localhost/unknown
- `unknown`, `127.0.0.1`, `::1` padaju na `socket.remoteAddress`
- Nulla ip i socket padaju na `'unknown'`

### Unit — rate limit (controller spec)

- Pod limit (1 do 60) se dozvoljava
- Nad limit (61) baca 429
- Redis greška → fail-closed 429
- Memory fallback radi isti limit sa lokalnom Map-om

### Integracija — `status-page.integration.spec.ts` (stvarno PostgreSQL)

- Postojeći testovi za `StatusIncidentsService` sa `publicCache` mock-om nadalje prolaze
- `bumpVersion` se poziva nakon `create`, `edit`, `addUpdate`, `linkTicket`, `unlinkTicket`

## Traceability

- `docs/backend/audits/29-status-page.md`: `BA-status-page-13` i `BA-status-page-14` označena `zatvoreno`; sekcija 8 ažurirana sa trust-proxy rate limitingom i shared cache invalidacijom; ključne korekcije section 14 mentions `13–14`
- `docs/backend/BACKEND-FINDINGS-REGISTER.md`: obje oznaka `zatvoreno`; kontrolni zbir **596 otvorenih / 96 zatvorena / 692 ukupno**
- `docs/backend/backend-findings-plan.json`: obje statusa `zatvoreno`
- `docs/backend/BACKEND-IMPLEMENTATION-MASTER-PLAN.md`: W6.12 završen na SHA `6a719b9`, CI `40843156212`

## Sljedeći paket (planirano, W6.13)

Najverovatniji kandidat je **BA-status-page-15** (incident/update/link/subscription retention i anonymization nisu formalizovani) — biće detaljno analizirano i potvrđeno sa korisnikom nakon W6.12 closeouta.
