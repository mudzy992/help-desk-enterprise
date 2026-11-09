# W6.48 — `BA-websocket-05`: effective Redis adapter health i readiness

**Status:** implementacija je dodana; `BA-websocket-05` ostaje otvoren dok push-triggered CI za testani SHA ne završi green.<br>
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

## CI i status

Commit/test SHA, push-triggered CI run, CI `skipped` poslovi i konačni finding status biće dopunjeni nakon zelenog CI-ja. Do tada izvorni audit red `BA-websocket-05` ostaje `otvoreno`, a status Val 6 brojeva se ne mijenja.
