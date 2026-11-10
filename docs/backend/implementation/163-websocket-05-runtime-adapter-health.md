# W6.48 — `BA-websocket-05`: effective Redis adapter health i readiness

**Status:** `BA-websocket-05` zatvoren na finding nivou nakon zelenog push-triggered CI-ja; nijedan drugi Val 6 nalaz nije zatvoren.<br>
**Scope:** samo prvi odabrani Val 6 P2 nalaz `BA-websocket-05`; nijedan susjedni WebSocket nalaz nije zatvoren.<br>
**Datum:** 2026-10-29

## Nalaz i acceptance cilj

Boot-time ACL probe i `ws_adapter_redis_ok=1` su dokazivali najviše da je adapter instaliran. Kasniji Redis `PUBLISH`/`PSUBSCRIBE` reject se samo logovao, a readiness nije znao da su cross-instance room emit-i degradirani. Lokalni in-memory adapter nije siguran fallback za horizontalni deployment.

Acceptance ovog paketa je da adapter postane `healthy` tek nakon stvarnog runtime Pub/Sub dokaza; kasniji publish/subscription/connection kvar odmah obori efektivno stanje; periodic recovery probe vrati healthy samo nakon uspješnog round-tripa; `/health/ready` vrati 503 dok stanje nije zdravo; runtime ne smije tiho prebaciti sobe u lokalni in-memory univerzum.

## Implementacija

- Uveden je process-local `WebsocketAdapterHealthService` sa `starting | healthy | degraded` stanjem. Health controller i WebSocket gateway koriste isti Nest provider kroz poseban health modul.
- Boot ACL `denied` i nedostajuća Redis konfiguracija i dalje ostavljaju API živim uz in-memory adapter, ali stanje je `degraded` i readiness ne prolazi. `unknown` više nije implicitno zelen.
- Nakon instalacije, monitor svakih **15 s** ponovo provjerava tačne adapter `PSUBSCRIBE`/`SUBSCRIBE` kanale na živom subscriber klijentu. Stvarni publisher emituje nonce na random, nejoinovanu room channel putanju i monitor čeka odgovarajući `pmessageBuffer` na adapterovom subscriberu. Socket.IO adapter odbaci nepoznatu sobu prije decode-a; nema aplikacijskog eventa ni trećeg Redis klijenta.
- `publish`, `subscribe`/`psubscribe` reject i ioredis connection lifecycle error odmah prijavljuju `degraded`. Runtime zadržava Redis adapter i njegov reconnect; tek uspješna kompletna probe vraća `healthy`, bez lokalnog fallback switcha.
- `GET /health/ready` sada uključuje javni, redigovani `checks.websocketAdapter: ok|fail`; stanje koje nije `healthy` daje 503. Adapter komponenta se ponovo čita iz process-local health service-a za svaki request, pa postojeći 5 s cache baze/Redisa ne odgađa degradaciju niti oporavak. Log prelaza zadržava `ws_adapter_redis_ok=0/1`, dodaje `ws_adapter_redis_state` i safe reason enum.
- Runbookovi objašnjavaju boot ACL fallback, runtime reconnect, readiness alarm, rolling restart nakon ACL korekcije i preostalu granicu: Redis outage ne daje durable realtime replay/acknowledgement.

## Lokalni testni dokaz

- `ws-redis-adapter.spec.ts` — fake-client publisher/subscriber round-trip kroz runtime monitor, stvarni room-channel pattern, kasniji `PUBLISH`, `PSUBSCRIBE` i `SUBSCRIBE` ACL reject, `degraded` stanje, adapter ostaje instaliran, stale in-flight probe ne briše noviju grešku i naredna uspješna probe vraća `healthy`.
- `websocket-adapter-health.service.spec.ts` — `starting`/`degraded` ne prolaze readiness; `healthy` prolazi; kasniji kvar ga zatvara.
- `health-probes.spec.ts` — `websocketAdapter=fail` ruši readiness bez izlaganja error detalja.
- `websocket.gateway.spec.ts` — nedostajuća konfiguracija i boot ACL deny ne označavaju in-memory fallback kao zdrav.
- `websocket.module.spec.ts` — Nest wiring i shared health provider.

Lokalno su prošli:

- adapter/health/readiness Jest: **3 suitea / 25 testova**, sa ts-jest diagnostics uključenim;
- gateway/module Jest: **2 suitea / 11 testova**, privremeni `diagnostics:false` zbog Prisma mock klase koja nema generated delegate tipove;
- targeted ESLint za sve izmijenjene backend fajlove.

Sandbox nema `redis-server` niti Docker, pa stvarni Redis/two-instance harness `ops/ws-cross-instance-check.mjs` nije pokrenut lokalno. Targeted testovi koriste fake ioredis klijente; push CI treba pružiti generated-Prisma build/full Jest i postojeći PostgreSQL+Redis integration gate. Nema lokalnog backend build/type-check dok generated Prisma client nije dostupan.

## Scope granice i rollout

- Nema promjene Socket.IO room pravila, autentifikacije, event payloadova ili reconnect replay ugovora.
- Runtime Redis kvar i dalje može izgubiti događaje dok ioredis reconnectuje; novi signal uklanja tiho stanje, ne uvodi durable event log. Klijent se oporavlja uobičajenim REST refreshom.
- Poznati boot ACL deny ne može se sigurno pretvoriti u Redis adapter bez restarta; nakon ispravke ACL-a rolling-restartati fallback instance. Runtime kvar na već instaliranom adapteru se oporavlja probeom, bez restart switcha.
- Nema Prisma schema izmjene, migracije ni target-DB upotrebe. Nema deploymenta, PR-a ili mergea.

## CI closeout i konačni status

Finalni kod/test SHA je [`ef52725`](https://github.com/mudzy992/help-desk-enterprise/commit/ef5272504b834aace79a3d6d20d24b1e6ad7e983). Push-triggered CI [`42591845905`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42591845905) je **overall success**: generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain job i CI gate su passed. E2E critical/install i read-only inventory bili su `skipped`; conditional high/critical image enforcement je takođe `skipped`, ne passed. Full E2E i Perf nisu ručno pokretani.

Sandbox nema `redis-server` ni Docker, pa `ops/ws-cross-instance-check.mjs` i live two-instance/ACL provjera BA-05 adapter probe nisu izvršeni. CI integration job je prošao, ali ne tvrdimo da je taj job sam pokrenuo novi probe kanal na dvije stvarne Socket.IO instance. Ovo je eksplicitna granica dokaza; unit fake-client testovi provjeravaju runtime event/command contract.

Zatvoren je samo `BA-websocket-05` (P2); audit baseline **4,88/10** nije rescoraan. Izvorni audit/plan: **509 otvoren / 183 zatvoren / 692 ukupno**. Globalni registar: **519 otvoren / 173 zatvoren / 692 ukupno**. Deset historijskih statusnih razlika nije rekoncilirano. Val 6: **52/109 zatvorenih, 57 otvorenih** (0 P1 / 40 P2 / 17 P3). `BA-websocket-06`–`14`, `BA-notifications-14`, `BA-integration-queue-05`, ostali P2/P3 i BA-15 full critical-flow acceptance ostaju otvoreni/pending; Val 6 nije završen. Nema schema promjene, migracije, target-DB upotrebe, PR-a, mergea ili deploymenta. Sljedeći Val 6 nalaz nije odabran ovim closeoutom.
