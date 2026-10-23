# Backend audit 39 — `health`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **5,64/10**  
**Nalazi:** 1 P1, 9 P2, 4 P3

## 1. Executive summary

`health` pruža tri anonimna operativna endpointa: procesni liveness (`/health`), database+Redis readiness (`/health/ready`) i starost worker heartbeata (`/health/worker`). Pure probe helperi se koriste i u worker health CLI-ju i dijelovima `ops-health` modula. Docker Compose backend healthcheck pravilno koristi readiness, a worker kontejner poseban CLI heartbeat check.

Baseline je **5,64/10**. Osnova je razumna: liveness ne zavisi od eksternih sistema; readiness zahtijeva i bazu i Redis; greške ne iznose hostove/poruke; neuspjeh vraća 503; probe imaju vremenski budžet; burstovi se dedupliciraju petosekundnim per-instance cacheom; heartbeat je TTL-ovan i nedostajući/nevalidan/stale timestamp pada; direktni suite je 6/6 zelen.

Kritični problem je da `withTimeout()` samo prestaje čekati kroz `Promise.race`, ali ne otkazuje originalnu DB/Redis operaciju. Javni readiness endpoint svakih pet sekundi može pokrenuti novu operaciju dok prethodne ostaju blokirane. Kod hung mreže/drivera to akumulira Prisma pool work/Redis zahtjeve i može pretvoriti dependency incident ili probe flood u iscrpljenje resursa upravo u procesu koji treba ostati dijagnostički dostupan. Timeout nije stvarni execution deadline.

Dodatno, worker evaluator timestamp iz budućnosti pretvara u age 0, pa budući/korumpirani heartbeat može označavati mrtav worker zdravim dok zidni sat ne stigne timestamp. `/health/worker` koristi hardkodiranih 120 sekundi umjesto konfigurisanog `private.ops.thresholds.workerHeartbeatStaleSeconds`, zbog čega javni/Docker i administrativni health mogu proturječiti. Ruta nije setup-gate exempt, pa tokom setupa ili DB outagea može vratiti setup/DB odgovor umjesto worker stanja. Readiness `SELECT 1` i Redis `PING` dokazuju konekciju, ne schema/migration kompatibilnost, write sposobnost, BullMQ tok niti startup/drain stanje.

Nema rate limita/edge politike, `Cache-Control: no-store`, failure logging/metrika u modulu, controller HTTP testova, Docker contract testa ni cancellation/resource-leak testa. Popravke nisu implementirane.

## 2. Scope i inventar

- 3 produkcijska TypeScript fajla;
- 1 direktni spec;
- 184 direktno izmjerena produkcijska LOC (registar navodi 187);
- 1 controller, bez injectable service klase;
- 3 javna GET endpointa;
- cross-module upotreba helpera u `ops-health` i worker health CLI-ju;
- Docker Compose backend i worker healthcheck integracija;
- nema Prisma modela, write API-ja niti korisničkog poslovnog stanja.

`ops-health` alarm engine i administrativni dashboard su zasebna audit jedinica 41. Ovdje se ocjenjuju javni probe ugovor, helperi i deployment health integration.

## 3. Liveness

`GET /health` vraća statični `{status:'ok'}`. To je pravilan process liveness model: ne treba restartovati zdrav proces samo zato što su DB/Redis privremeno nedostupni. Ruta je setup-exempt i može odgovoriti prije završene instalacije.

Ipak odgovor ne dokazuje event-loop responsiveness pod značajnim lagom osim same sposobnosti HTTP handlera da se izvrši. To je prihvatljivo za liveness, dok event-loop signal pripada metrics/ops-health sloju. Nedostaju eksplicitni `Cache-Control: no-store`, `Pragma` i stable content-type/response contract testovi. Shared proxy/monitor ne bi smio posluživati cacheirani health odgovor.

Nema shutdown/draining stanja. Tokom graceful shutdowna liveness/readiness mogu ostati 200 dok server još prima zahtjeve i resursi se zatvaraju. Readiness treba postati fail prije prestanka prihvata prometa, uz preStop/drain ugovor.

## 4. Readiness semantika

`GET /health/ready` paralelno izvršava:

- `SELECT 1` preko Prisma;
- Redis `PING`;
- DB deadline nominalno 2 s, Redis 1 s;
- status `ok` samo ako su oba uspješna;
- 503 za fail;
- rezultat bez error detalja.

To je dobra minimalna dependency readiness definicija. Međutim ona dokazuje samo da oba endpointa trenutno odgovaraju. Ne dokazuje:

- da su migracije/schema kompatibilne sa aplikacijom;
- da aplikacijska tabela može biti pročitana;
- da je DB writable kada je write promet potreban;
- da Redis može `SET/EX`, pub/sub ili BullMQ command flow;
- da su queue scheduleri/workeri funkcionalni;
- da je API završio startup bootstrap;
- da instanca nije u draining/shutdown stanju.

`SELECT 1` može ostati zelen dok deployment ima pogrešnu migracijsku verziju i svi business queryji padaju. Potreban je lagan schema compatibility sentinel i eksplicitna startup/drain state komponenta. Redis probe treba ostati bounded i može provjeriti write/delete samo ako deployment contract to zahtijeva i key namespace/TTL su sigurni.

Readiness rezultat se cacheira pet sekundi. To štiti dependencyje od burstova, ali omogućava do pet sekundi stale-successa nakon outagea i stale-failurea nakon oporavka. To je uglavnom razuman tradeoff, ali treba biti dokumentovan u orchestrator failureThreshold/interval budžetu.

## 5. Timeout bez otkazivanja — P1

`withTimeout` koristi `Promise.race([work(), timer])` i čisti samo timer. Kada timer pobijedi, `work()` nastavlja raditi. Ne prima `AbortSignal`, ne koristi driver query timeout i ne prekida socket/request.

Posljedice:

1. hung Prisma query zadržava connection/pool waiter i nakon HTTP 503;
2. petosekundni cache dopušta novu hung query svakih pet sekundi;
3. javni monitor ili napadač može održavati stalno stvaranje worka;
4. više API replika multiplicira problem;
5. dependency incident može prerasti u pool/memory/event-listener iscrpljenje;
6. naknadni business requestovi mogu ostati bez pool kapaciteta;
7. probe timeout stvara lažan osjećaj da je resource budget zatvoren.

Potrebni su stvarni DB `statement_timeout`/query deadline i cancellable Redis command/socket timeout. Generic helper treba prihvatiti `AbortSignal` i dokumentovati da samo abort-aware work daje hard deadline. Concurrent probe mora imati single-flight sve dok se underlying work stvarno ne završi ili ne otkaže; ne smije se nakon TTL-a pokrenuti nova instanca dok prethodna curi.

## 6. CachedProbe behavior

`CachedProbe` cacheira Promise sa timestampom prije završetka. Unutar TTL-a pravilno spaja concurrent monitore. Nakon isteka TTL-a pokreće novu probu čak i ako je prethodni Promise još pending. U kombinaciji s neotkazivim workom ovo je dio P1 lanca.

Cache je per-process. Horizontalno skaliranje znači po jedan DB/Redis probe po instanci svakih pet sekundi, što je očekivano za instance readiness, ali vanjski flood i dalje prolazi kroz cijeli Nest/HTTP middleware stack. Cache nema jitter; više replika/orchestrator pollova može sinhronizovano udariti dependencyje.

Rejected Promise se cacheira do TTL-a. Readiness runner interno mapira dependency greške u `fail`, ali budući caller koji koristi `CachedProbe` sa throwing runnerom nasljeđuje rejected-cache ponašanje. Helper treba imati eksplicitnu state/error politiku i testove za rejected, long-running i clock-regression slučajeve.

Ako se sistemski sat vrati unazad, `now-at` postaje negativan i cache može ostati validan duže od TTL-a. Za trajanja treba koristiti monotonic clock (`performance.now()`), ne wall clock.

## 7. Worker heartbeat tačnost

`GET /health/worker` čita jedan Redis key sa timeoutom i procjenjuje ISO timestamp. Missing, malformed i stariji od 120 sekundi vraćaju 503. Heartbeat writer piše svakih 10 sekundi sa TTL-om od jednog sata; to omogućava razlikovanje stale od missing stanja u drugim komponentama.

Ključni nedostaci:

- budući timestamp koristi `Math.max(0, age)` i postaje potpuno zdrav;
- nema maksimalno dopuštenog future skew-a;
- jedan zajednički key dokazuje da je najmanje jedan worker živ, ne da su sve očekivane replike žive;
- key ne nosi worker instance ID, boot ID, build SHA ili capability/queue coverage;
- Redis dostupnost i heartbeat odsustvo oba se javno mapiraju u isti fail/null;
- hardkodiranih 120 s može se razlikovati od operatorskog settings praga 30–900 s;
- endpoint vraća tačnu starost anonimnom pozivaocu.

Future timestamp može nastati clock skewom, restoreom, ručnim pisanjem ili kompromitovanim Redis writerom i prikriti outage dugo vremena. Evaluator treba odbiti timestamp više od malog skew prozora u budućnosti. Za više workera potreban je per-instance leased heartbeat i expected/active replica agregat ili jasno dokumentovana semantika “barem jedan worker”.

## 8. Setup gate i routing kontradikcija

Install allowlist izuzima `/health` i `/health/ready`, ali ne `/health/worker`. Prije završetka setupa worker probe zato može vratiti `SETUP_REQUIRED`. Kada baza nije dostupna, setup middleware može vratiti setup database 503 prije nego controller pročita Redis.

To proturječi namjeni anonimnog nezavisnog worker monitora. Monitor ne dobija worker status baš tokom install/DB incidenta kada je signal koristan. `/health/worker` treba biti eksplicitno setup-exempt ili se endpoint treba premjestiti iz API setup gatea. Test mora dokazati sve tri health rute kroz incomplete setup i DB outage.

## 9. Deployment ugovor

Docker backend healthcheck koristi `/health/ready`, interval 15 s, timeout 5 s, 4 retries i start period 120 s. To je dobro usklađeno sa migracijama pri startupu. Worker koristi CLI koji čita isti heartbeat key, interval 30 s, timeout 10 s, 4 retries i start period 90 s.

Worker CLI timeout također ne otkazuje underlying Redis connect/get, ali proces odmah završava nakon rezultata, pa OS prekida resurse; to je manje opasno od dugotrajnog API procesa. CLI u catch ispisuje raw error message u container health log. To može izložiti Redis host/transport detalje operaterima koji imaju container pristup; nije javni leak, ali strukturirani klasifikovani reason bi bio bolji.

API health controller nema build/revision identitet — ispravno za javnu minimalnu rutu — ali deployment sistem nema zaseban authenticated provenance endpoint u ovom modulu koji potvrđuje da je nova verzija stvarno aktivna. To pripada observability/ops sloju.

## 10. Abuse, cache i informacijska površina

Endpointi su anonimni i bez rate limitera. Petosekundni probe cache značajno ograničava DB/Redis frekvenciju, ali ne HTTP/event-loop/bandwidth trošak. `/health` nema nikakav cache i može se floodati. Edge/reverse-proxy rate/burst limit treba biti dovoljno visok za orchestrator i monitore, ali bounded.

Readiness otkriva samo `database: ok/fail` i `redis: ok/fail`, bez hostova ili errora. To je dobar minimalni leak tradeoff, ali ipak anonimnom napadaču omogućava precizno vremensko mapiranje dependency outagea. `/worker` dodatno otkriva heartbeat age. Ako javni internet monitoring nije potreban, detaljne komponente mogu biti network-restricted, dok javna ruta vraća samo aggregate status.

Nijedna ruta eksplicitno ne postavlja no-store. Health odgovor ne treba cacheirati browser, CDN ni shared proxy. `Vary` nije potreban jer nema auth/personalizacije.

## 11. Observability i incident dijagnostika

Controller guta sve dependency greške u `fail` i ne loguje/metricira timeout naspram connection/auth/query failurea. Javni payload treba ostati minimalan, ali interna metrika treba imati:

- probe duration i outcome po dependencyju;
- timeout/cancel/error category;
- in-flight i abandoned operation count;
- cache hit/miss/stale-success;
- heartbeat missing/stale/future/malformed;
- readiness transition i drain reason.

Ops-health ima bogatije signale, ali javni readiness code ne emituje vlastiti dokaz da failure mapping radi. Tokom totalnog ops-health/worker incidenta API lokalne metrike/logovi su posljednja linija.

## 12. Test dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  src/modules/health/health-probes.spec.ts
```

Rezultat: **1/1 suite prošao; 6/6 testova prošlo**.

Dokazano je:

- readiness zahtijeva oba dependencyja;
- error detalj se ne vraća;
- nominalni hanging dependency vraća fail nakon timer racea;
- fast work prolazi;
- heartbeat read retry helper;
- fresh/stale/missing/malformed heartbeat;
- CachedProbe TTL reuse.

Nije dokazano:

- stvarno otkazivanje underlying DB/Redis worka;
- da nakon timeouta nema akumulacije;
- controller HTTP 200/503/body/header behavior;
- setup gate za `/health/worker`;
- future timestamp/clock skew;
- configured threshold consistency;
- rejected/long-running cache, clock rollback i multi-instance behavior;
- Docker/Coolify health contract;
- startup/drain transition;
- schema mismatch i Redis write/BullMQ degradation.

## 13. Pozitivni nalazi

1. Liveness je pravilno odvojen od dependency readinessa.
2. Readiness zahtijeva i DB i Redis.
3. Dependency probe se izvršavaju paralelno.
4. Failure vraća HTTP 503.
5. Javni odgovor ne iznosi host, exception ni version detalje.
6. Petosekundni cache single-flighta burst unutar TTL-a.
7. Missing/malformed/stale heartbeat pada.
8. Worker heartbeat ima periodični writer i TTL duži od stale praga.
9. Backend Docker healthcheck koristi readiness, ne liveness.
10. Worker Docker healthcheck koristi heartbeat CLI.
11. Startup period pokriva migracije/boot.
12. Direktni suite je potpuno zelen, 6/6.

## 14. Registar nalaza

| ID           | Severity | Nalaz                                                                                              | Status   |
| ------------ | -------- | -------------------------------------------------------------------------------------------------- | -------- |
| BA-health-01 | P1       | `withTimeout` ne otkazuje DB/Redis work; javni periodični probe može akumulirati hung operacije     | otvoreno |
| BA-health-02 | P2       | CachedProbe pokreće novi work nakon TTL-a i kada je prethodni underlying probe još pending          | otvoreno |
| BA-health-03 | P2       | Budući heartbeat timestamp clampuje se na age 0 i može prikriti mrtav worker                        | otvoreno |
| BA-health-04 | P2       | Worker endpoint/CLI hardkodira 120 s i može proturječiti konfigurisanom ops heartbeat pragu         | otvoreno |
| BA-health-05 | P2       | `/health/worker` nije setup-gate exempt i tokom setup/DB outagea ne daje nezavisan worker signal    | otvoreno |
| BA-health-06 | P2       | Readiness `SELECT 1` ne dokazuje schema/migration kompatibilnost ni aplikacijski query              | otvoreno |
| BA-health-07 | P2       | Redis `PING` ne dokazuje write/TTL/pubsub/BullMQ capability potreban aplikaciji                     | otvoreno |
| BA-health-08 | P2       | Nema startup-complete/draining readiness statea za siguran rolling deploy                          | otvoreno |
| BA-health-09 | P2       | Anonimne health rute nemaju edge/rate abuse ugovor ni hard HTTP resource budget                    | otvoreno |
| BA-health-10 | P2       | Nema controller/deployment/cancellation/resource-leak integration dokaza                           | otvoreno |
| BA-health-11 | P3       | Health odgovori ne postavljaju eksplicitni `Cache-Control: no-store`                               | otvoreno |
| BA-health-12 | P3       | CachedProbe koristi wall clock; rollback može produžiti cache, a replike nemaju jitter              | otvoreno |
| BA-health-13 | P3       | Public worker ruta otkriva tačnu heartbeat starost i ne razdvaja Redis failure od missing heartbeata | otvoreno |
| BA-health-14 | P3       | Probe failure category/duration/cache/cancel metrike i lokalni transition logovi nedostaju          | otvoreno |

## 15. Ključne korekcije

- **01–02:** stvarni driver deadlines/cancellation, AbortSignal ugovor i single-flight do underlying completiona.
- **03–05:** future-skew reject, jedinstveni threshold source i setup-exempt worker ruta.
- **06–08:** schema sentinel, potrebni Redis capability check te startup/drain readiness state.
- **09,11,13:** network/edge limit, no-store headers i minimalni aggregate public signal.
- **10,12,14:** controller/deployment/load testovi, monotonic cache clock, jitter i probe telemetry.

## 16. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   6,60 |
| B. API i ugovori             |    12% |   6,00 |
| C. Auth/authz/scope          |    15% |   6,20 |
| D. Poslovna pravila/stanje   |    13% |   5,70 |
| E. Podaci/Prisma/transakcije |    13% |   5,10 |
| F. Sigurnost/privatnost      |    12% |   5,80 |
| G. Async/integracije         |     8% |   4,80 |
| H. Testovi/dokazivost        |    10% |   5,20 |
| I. Operativnost/perf.        |     7% |   4,50 |
| **Ukupno**                   | **100%** | **5,64/10** |

Ponderisani rezultat je približno **5,66/10**, konzervativno zaključen na **5,64/10** zbog P1 neotkazanih operacija u javnom probe toku. Postojeća separacija liveness/readiness, minimalni payload, Docker wiring i zeleni pure testovi sprečavaju nižu ocjenu.

## 17. Fazni plan

### Faza 0 — safety net

Controller HTTP testovi, setup-gate matrica, future timestamp, configured threshold, long-running/rejected cache, resource-leak i Compose contract testovi.

### Faza 1 — hard deadlines

Abort-aware helper, Prisma statement/query timeout, Redis command timeout i single-flight koji ne pokreće novi work dok stari nije završio/otkazan.

### Faza 2 — readiness state

Startup-complete, migration/schema sentinel, draining/preStop i dokumentovana Redis capability semantika.

### Faza 3 — worker model

Future skew reject, jedinstven threshold source, setup exemption i per-instance/expected-worker heartbeat model.

### Faza 4 — edge i observability

No-store, bounded public/edge rate, aggregate/detail network policy, monotonic cache+jitter, probe metrics i transition logs.

### Faza 5 — finalni gate

Unit/integration/deployment/load testovi zeleni na finalnom SHA-u; dokazati DB/Redis hang bez leaked worka, rolling drain bez prometa i tačan worker signal kroz setup/outage/clock-skew scenarije.

## 18. Acceptance i presuda

1. Probe deadline stvarno prekida ili driver-level ograničava underlying operaciju.
2. Nema više od jednog istovremenog probe worka po dependencyju/instanci.
3. Future heartbeat izvan malog skew prozora je fail.
4. Javni, CLI i ops-health koriste dosljedan threshold ili jasno različit dokumentovan ugovor.
5. Worker health ostaje dostupan tokom setupa i DB outagea.
6. Readiness dokazuje kompatibilnu schema/startup state i pada prije drain shutdowna.
7. Redis check odgovara stvarnim obaveznim capabilityjima bez štetnih side-effecta.
8. Javne rute imaju no-store i bounded edge abuse politiku.
9. Probe failurei su interno mjerljivi bez javnog curenja detalja.
10. Controller, cancellation, deployment i load matrica prolaze.

Modul ima korisnu i uglavnom pravilno razdvojenu osnovu, ali timeout koji ne otkazuje work je ozbiljna operativna zamka. Health check ne smije tokom incidenta postati izvor dodatnog incidenta. Iskren baseline je **5,64/10**.
