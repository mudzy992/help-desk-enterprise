# W6.49 — BA-websocket-06: distributed WebSocket admission limits

**Audit nalaz:** `BA-websocket-06` (P2), [audit 18 §9 — rate limit](../audits/18-websocket.md#9-rate-limit-resource-bounds-i-observability), [§12 — registar](../audits/18-websocket.md#12-registar-nalaza) i [§24 — status](../audits/18-websocket.md#24-w6-49-implementation-status-ba-websocket-06-2026-10-29)
**Scope:** samo zajedničko IP/user ograničenje handshakea, limit aktivnih konekcija po korisniku i zaštita od reconnect oluja; bez zatvaranja susjednih nalaza.
**Status:** zatvoreno (2026-10-29) operativnom potvrdom vlasnika uz CI dokaz; vidi audit 18 §30.

## Implementacija

- Novi `WebsocketAbuseLimiter` koristi Redis Lua skripte za atomsku token-bucket potrošnju i lease operacije. Redis server `TIME` određuje refill vrijeme, tako da replike koriste isti sat. Ključevi su scope-separated HMAC-SHA-256 pseudonimi izvedeni iz identiteta i postojećeg JWT signing secreta; sirovi IP/user ID se ne zapisuje u Redis ključeve ili limit logove.
- `WebsocketGateway` uzima adresu iz Socket.IO `handshake.address`, prije autentikacije. Ne čita `X-Forwarded-For` ni druge forwarding headere. IP bucket ima burst od **120** pokušaja i refill od **1 tokena / 500 ms**.
- Nakon uspješne autentikacije user bucket ograničava reconnect handshake na burst **8** i refill **1 token / 5 s**. Ista admission skripta atomskom rezervacijom ograničava korisnika na **8 aktivnih konekcija**. Rezervacija traje **60 s**, obnavlja se svakih **20 s**, uklanja se na disconnect, a izgubljeni disconnect se oporavlja istekom leasea.
- Ticket `join`/`leave` i `presence` zadržavaju postojeći per-socket zaštitni prozor, uz dodatne nezavisne Redis limite po korisniku: svaki ima burst **60** i refill **1 token / 250 ms**. Event se odbija prije autorizacijskog/servisnog rada kada zajednički limit nije dostupan ili je prekoračen.
- Nevažeća transport adresa, nepostojanje Redis providera, Redis greška ili signing-secret greška odbijaju handshake/event (fail closed). Svaka provjera ima **2 s** hard timeout, tako da i stalled Redis/secret lookup ne zadržava handshake neograničeno. Admission lease marker obavezno veže ticket evente uz konekciju koju je gateway primio.

## Ciljani testovi i provjere

- `websocket-abuse-limiter.spec.ts`: adresa i forwarding-header izolacija, HMAC pseudonimi, IP/user token bucket parametri, connection-cap lease, release/renewal, nevažeća Redis odluka i fail-closed ponašanje.
- `websocket-abuse-limiter.integration.spec.ts`: dva nezavisna Redis klijenta provjeravaju zajedničku atomsku bucket potrošnju, TTL, konkurentni connection cap, release i istekao lease. Spec je registrovan u isolated integration runneru.
- `websocket.gateway.spec.ts`, `websocket.module.spec.ts`, `ticket-chat.gateway.spec.ts` i `ticket-chat.gateway.socket.spec.ts`: admission redoslijed, fail-closed putanje, gateway wiring, agregatni user limiti i stvarni Socket.IO event regresije.
- Lokalni targeted Jest rezultat: **46 passed**, **2 skipped** u Redis integracijskom specu jer sandbox nema postavljen `REDIS_HOST`; 5 suiteova passed, jedan suite skipped. `diagnostics:false` je korišten jer generated Prisma artefakti nisu dostupni u sandboxu. Targeted ESLint je prošao.
- `prisma generate` nije završio: sandbox ne može dohvatiti `binaries.prisma.sh`; zato lokalni generated-Prisma type/build rezultat nije dostupan. Live Redis/two-instance acceptance nije pokrenut. Nema tvrdnje o CI, staging ili runtime potvrdi.

## Granice

Ovaj paket ne mijenja `BA-websocket-05` adapter readiness, `BA-websocket-14` cross-instance revocation acceptance, druge audit nalaze, schema/migracije, limit pragove drugdje, niti release/operativni deployment. Val 6 ukupni finding brojevi ne mijenjaju se: `BA-websocket-06` ostaje otvoren, a puna Val 6 i zasebna frontend plan 6.3 `OPEN-CI-FINAL` ostaju izvan ovog dokaza.
