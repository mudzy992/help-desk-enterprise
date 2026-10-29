# Backend audit 41 — `ops-health`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **3,68/10**  
**Nalazi:** 7 P1, 12 P2, 5 P3

## 1. Executive summary

`ops-health` je centralni operativni control plane: prikuplja DB/Redis/disk/ClamAV/BullMQ/scheduler/DLQ/HTTP/WebSocket/security/inbound-email/LDAPS signale, evaluira pragove i hysteresis, održava alarm state machine, šalje email/in-app/Teams/fallback upozorenja, čuva snapshot i baseline u Redis-u, vodi Postgres alarm historiju, pokreće worker health rundu i API watchdog te izlaže administratorski dashboard i akcije acknowledge/silence/test/DLQ-reviewed.

Baseline je **3,68/10**. Modul ima značajnu funkcionalnu širinu i više dobrih zaštita: permissions su razdvojene na view/manage/receive; silence ima bounded trajanje i razlog; acknowledge je transakcijski auditiran; partial unique indeks sprečava više otvorenih redova po ključu; CAS nad `notifyCount` koordinira replike; probe imaju nominalne timeoutove; watchdog ima dedicated Redis konekciju, distributed lock, cold-start grace i canary; fallback postoji kada DB/Redis nisu dostupni; javni payload ne postoji; testirana pure logika je opsežna.

Ipak sedam P1 nalaza direktno potkopavaju glavnu svrhu modula — pouzdanu isporuku kritičnog alarma. `withTimeout` ne otkazuje underlying DB/Redis/BullMQ operacije, a koristi se u periodičnom workeru, watchdogu i dashboardu, pa hung dependency može akumulirati work. Alert engine claimuje notification u bazi prije vanjske isporuke; pad procesa poslije claima, prije slanja, ostavlja alarm kao notified i početna kritična poruka može biti izgubljena do mnogo kasnijeg remindera. Ako bilo koji kanal uspije, događaj se smatra isporučenim; neuspjeli email ili Teams kanal se više ne retryja kada je in-app uspio.

Recipient query ima hard cap od 50 bez paginacije ili upozorenja. Svi legitimni `ops.alerts.receive` primaoci iza prvih 50 se tiho preskaču. Dodatne email adrese nemaju delivery ledger, a fallback deduplikacija je samo memorijska. Process restart resetuje fallback state i gubi/ad duplicira degraded alarm lifecycle.

Teams webhook setting prihvata bilo koji HTTPS URL, a uptime push bilo koji HTTP/HTTPS URL; server šalje operativne detalje i obavlja egress bez host/IP allowliste. To je SSRF/metadata-egress granica. Konačno, silence i DLQ baseline prvo se mijenjaju u Redis-u pa tek onda audituju u Postgresu. Ako audit padne, globalna alarm politika je već promijenjena, API vraća grešku, a promjena ostaje bez durable dokaza.

Direktni test rezultat: 5/12 suiteova prošlo, 7/12 compile-blockirano, 44/44 izvršena testa zelena. Blokade potiču iz nepotpunog generated Prisma clienta. Popravke nisu implementirane.

## 2. Scope i inventar

- 25 produkcijskih TypeScript fajlova;
- 12 direktnih specova;
- 4.139 direktno izmjerenih produkcijskih LOC (registar navodi 4.164);
- 1 controller, 6 glavnih servisa/engine komponenti;
- 7 administratorskih ruta;
- worker scheduler/processor/runner i API watchdog;
- 20 ručno registrovanih BullMQ queueova;
- email, in-app, Teams webhook, environment fallback i uptime push integracije;
- Prisma `OpsAlert` model sa partial unique indeksom za jedan otvoreni alarm po ključu;
- Redis state: streaks, silence, DLQ baseline, snapshot, watchdog lock/canary i metric buckets.

## 3. Authorization i administratorske akcije

Read rute zahtijevaju `ops.health.view`; silence, unsilence, test i DLQ baseline zahtijevaju `ops.alerts.manage`. Acknowledge koristi view permission jer samo zaustavlja remindere. Session i centralni RoleGuard su prisutni. DTO silence ograničava 15–480 minuta i zahtijeva reason od 5–300 znakova; history limit je 1–500.

Acknowledge koristi transakciju: conditional `FIRING -> ACKNOWLEDGED`, row read i audit su zajedno. To je dobar obrazac. Međutim silence, unsilence i DLQ baseline mijenjaju Redis pa odvojeno zapisuju audit u DB. Audit failure ostavlja aktivnu promjenu bez evidencije i klijentu signalizira neuspjeh, pa retry može promijeniti state ponovo. Redis i Postgres ne mogu imati zajedničku transakciju; potreban je durable Postgres command/ledger + transactional audit, pa idempotentna projekcija u Redis.

`sendTest` prvo šalje vanjske poruke, zatim audituje. Audit failure poslije slanja vraća grešku i operator može ponoviti test, stvarajući dodatne poruke bez jasnog first-attempt zapisa. Sve mutation rute trebaju idempotency key i command lifecycle.

## 4. Alarm notification claim i trajni gubitak

`announce()` radi CAS update `notifyCount + 1` i `lastNotifiedAt=now` prije poziva notifiera. To sprečava dvije replike da istovremeno pošalju isti događaj. Međutim DB claim nije delivery outbox:

- crash/kill/OOM poslije claima, prije `notify()` ostavlja događaj trajno claimed;
- timeout ili procesni restart prije release logike ima isti ishod;
- nema `SENDING` lease/expiry ni recovery joba;
- reminder može doći tek nakon konfigurisanih sati;
- za critical outage početna paging poruka je najvažnija.

Ako notifier vrati nula isporuka, engine pokušava vratiti `notifyCount`, ali i taj update je best-effort i greška se guta. Zatim fallback success ponovo pokušava claim, opet best-effort. Lokalni row može netačno pokazati da je poruka isporučena ili nije.

Potreban je durable `OpsAlertDelivery` outbox po alarm eventu i kanalu, sa statusom, attemptom, leaseom, nextAttemptAt, provider ID-em i DLQ-em. Claim treba biti lease koji se može reclaimati, a `OpsAlert.notifyCount` derived summary nakon confirmed delivery.

## 5. Multi-channel semantika

Notifier paralelno šalje email, in-app i Teams. Engine smatra event delivered ako je bilo koji kanal isporučio barem jednu poruku. Uobičajeni slučaj je da in-app uspije, a email/Teams pager ne uspije. Pošto je globalni event označen isporučenim, neuspjeli kanal nema retry. In-app poruka koju niko ne vidi može time spriječiti retry stvarnog on-call kanala.

Delivery correctness mora biti po kanalu i recipientu. Required escalation channels trebaju konfigurabilni quorum/policy (`at least one external pager`, `all mandatory`, fallback after N failures`). Partial success mora ostaviti samo neuspjele deliveries pending. Reminders ne zamjenjuju kanal-specifični retry.

Email delivery za user recipients koristi ledger helper i dedupe key, što je pozitivno. Extra recipient adrese idu direktno transportu bez ledger-a. Teams takođe nema durable ledger/provider ID. Fallback state je memorijski.

## 6. Recipient completeness

Recipient query uzima aktivne, neanonimizirane korisnike sa SuperAdmin rolom ili eksplicitnim receive permissionom, ali završava sa `take: 50`, sortiranjem po ID-u. Ako permission ima više od 50 korisnika:

- ostali se tiho ne obavještavaju;
- nema paginacije/fan-out joba;
- nema alarma da je cap dosegnut;
- operator dashboard ne pokazuje truncated recipient set;
- izbor zavisi od ID sort ordera, ne on-call prioriteta.

Komentar kaže da bi više od 50 značilo preširoku permission dodjelu, ali kod to ne provodi niti upozorava. Sigurnosna pretpostavka ne smije biti tihi data-loss branch. Treba ili odbiti/alertirati invalid configuration ili paginirano fan-outati uz bounded batch i eksplicitni recipient policy.

## 7. Fallback reliability

Kada DB nije dostupan, engine koristi environment SMTP/Teams fallback. Ovo je dobra nezavisna linija odbrane. Međutim open alarms, pending history i dedupe timestampovi žive samo u Mapama procesa. Restart/redeploy:

- zaboravlja da je outage već otvoren;
- može ponovo poslati duplicate opened;
- gubi resolved history koja je čekala povrat DB-a;
- ne može koordinirati više worker/API replika;
- fallback “once per key/kind per 30 min” nije cluster-wide.

Ako fallback nije konfigurisan, DB outage — jedan od najvažnijih alarma — nema vanjski kanal. Overview samo pokazuje `fallbackConfigured`; deployment/startup gate ne zahtijeva fallback za production.

Potreban je nezavisan durable store ili eksterni pager koji ne zavisi od istog DB/Redis failure domaina, cluster-wide idempotency i production readiness policy koja potvrđuje barem jedan fallback kanal.

## 8. SSRF i outbound trust

Settings loader prihvata Teams webhook ako string počinje `https://`; environment fallback radi isto. Nema canonical URL parse/hostname allowliste, DNS/IP/private-network provjere niti re-resolve zaštite. `postTeamsWebhook` doduše koristi 5 s AbortController i `redirect:'error'`, što je pozitivno, ali može POST-ovati operativne detalje na proizvoljan HTTPS host.

`OPS_UPTIME_PUSH_URL` prihvata HTTP i HTTPS i šalje GET svaki health round. Environment je deployment-trusted, ali kompromitovan config/deployer može skenirati interne servise; HTTP može izložiti monitor token. Teams secret setting je administratorski upravljiv i `sendTest` omogućava odmah aktivirati request.

Potrebni su Teams/approved provider hostname allowlist, HTTPS-only, port policy, DNS resolution sa private/link-local/loopback zabrandom i egress firewall. Uptime push treba canonical HTTPS allowlist i token-safe logging. Response body se ne čita, što ograničava exfil, ali timing/status ostaje SSRF signal.

## 9. Probe timeout i resource leakage

Modul masovno koristi `withTimeout()` iz `health`, koji je samo `Promise.race` i ne otkazuje underlying work. Periodični worker, API watchdog i admin overview mogu ostaviti hanging Prisma, Redis i BullMQ operacije. Queue inspection otvara 20 Queue objekata i svaki timeout može ostaviti internu komandu aktivnom.

Health runda se izvršava svake minute sa BullMQ lockom 45 s. Ako runner traje duže od locka, BullMQ može označiti stalled/reprocess dok prvi work još traje. Processor concurrency 1 ne štiti od lock loss/stalled recovery na drugom workeru. `attempts:1` znači da se failed round ne retryja; sljedeća je tek za minut.

Potrebni su driver-native deadlines/AbortSignal, global round deadline kraći od locka, lock renewal dokaz, cancellation i in-flight metric. Nijedan novi round ne smije početi dok prethodni underlying probes nisu završili/otkazani.

## 10. Silence, acknowledge i escalation

Silence se čuva samo u Redis-u sa TTL-om. Redis outage znači da engine ne može pouzdano vidjeti silence; fallback path može slati poruke uprkos operatorovom globalnom silenceu. Suprotno, Redis restore/flush može prerano ukloniti silence. Dashboard može prikazati null bez razloga.

Silence globalno utiče na sve alarm ključeve i sve operatore, ali nema scope po key/severity/channel. Maximum osam sati ograničava štetu, a razlog/audit su pozitivni. Potreban je durable DB source of truth i Redis cache, sa per-key/severity opcijom i visible “silence storage degraded” signalom.

Acknowledge zaustavlja remindere čak i ako initial external pager nije isporučen. Operator sa view permissionom može acknowledge; ovo je namjerno, ali view permission time dobija mutacijski globalni efekat. Permission katalog i UI trebaju jasno tretirati acknowledge kao zasebnu capability ili dokazati prihvaćeni model.

## 11. DLQ baseline

Prvi health run postavlja trenutne failed/DLQ countove kao baseline, pa historijski failures nakon deploya ne otvaraju alarm. To sprečava noisy upgrade, ali može sakriti postojeći neobrađeni backlog upravo kada monitoring prvi put počinje. Nema bootstrap warninga “baseline initialized with N failures”.

Operator “pregledano” prepisuje baseline trenutnim countovima. Snapshot queue counts mogu biti do pet minuta stari, dok integration DLQ count dolazi live iz DB-a; rezultat je vremenski torn baseline. Redis write i audit nisu atomski. Baseline nema actor/time/version u samoj vrijednosti, samo brojke.

Treba koristiti versionirani acknowledgement record u DB-u po queueu sa observedAt, actor, reason i source snapshot ID-em. Baseline initialization sa nonzero vrijednostima mora proizvesti visible informational/critical review event.

## 12. Metrics tačnost

HTTP i WebSocket servisi premjeste pending mapu u lokalni `batch`, postave novu praznu mapu, pa kod Redis/pipeline failurea batch trajno odbace. Upravo tokom Redis incidenta graf i alarm gube 5xx/traffic/WS podatke. Null ponekad znači outage, ali izgubljeni bucket poslije oporavka izgleda kao realna nula.

Pipeline `exec()` rezultat se ne provjerava po commandu; partial Redis error može se tretirati kao uspjeh. INCR i EXPIRE su odvojene komande. Shutdown flush takođe može izgubiti podatke.

`websocketHeartbeatSeen()` koristi SCAN rezultate koji mogu već sadržavati Redis key prefix i prosljeđuje ih direktno `mget`; za ioredis keyPrefix deployment postoji rizik dvostrukog prefixa. `readEventLoopLagMs()` eksplicitno skida prefix, što pokazuje nedosljednost. Kod scan failurea websocket heartbeat helper vraća `true`, a zatim missing counters postaju nule — outage može izgledati kao miran promet.

Event-loop signal koristi mean, ne p95/max; kratki ozbiljni stallovi se mogu izgubiti. HTTP metric isključuje `/health`, ali ne nužno sve internal monitor/setup rute. Status se broji tek na `finish`; aborted response nije evidentiran.

## 13. Signal coverage i unknown semantika

Collector obuhvata mnogo relevantnih signala i unknown uglavnom ne pretvara u false alarm. Međutim “unknown means inactive” može dugo sakriti failure kada je sam collector pokvaren. Redis fail alarm pokriva dio, ali pojedinačna schema/query/metric greška vraća null bez dedicated collector-degraded alarma.

Queue lista je ručno održavana. Test worker module liste pomaže, ali novi queue može ostati neuključen dok test ne obuhvati novi import. Queue inspection parcijalno preskače failed queue probe; snapshot ne navodi koje queueove nije uspio pročitati, pa dashboard izgleda kao manja zdrava lista.

Disk probe mjeri filesystem `UPLOAD_ROOT` na workeru; u razdvojenim mountovima to ne mora predstavljati API upload path/volume. ClamAV TCP ping dokazuje port, ne stvarni scan/EICAR flow. DB `SELECT 1` i Redis `PING` imaju iste semantic gaps kao modul 39.

Inbound overview vraća raw `lastError` i mailbox key korisniku sa `ops.health.view`. Error može sadržavati server/provider/mailbox detalje. Treba strukturirani redacted code i detalje ograničiti višoj permissioni.

## 14. Alert state i Prisma invarianti

`OpsAlert` ima partial unique indeks za jedan non-resolved row po keyu, što je dobra horizontalna zaštita. Ipak status/severity/key su stringovi u schemi, bez enum/check constrainta. JSON `details` nema schema version ni size limit. Nepoznat key se može prikazati bez runbooka.

State transitioni su više odvojenih queryja i nisu općenito u Prisma transakciji. Open uniqueness race se hvata. Escalate/resolve/update, streak Redis write i external delivery nisu jedan durable state machine/outbox ugovor. Redis streak failure se guta/degradira na memoriju; nakon restarta hysteresis resetuje.

History purge briše resolved alerts bez legal-hold/export checkpointa i pokreće se best-effort jednom po satu samo u memoriji jednog runnera. `lastPurgeAt` se postavlja prije deletea; nakon failurea čeka još sat. DB historyDays config ima fallback, ali nema evidence da purge action ima audit/metrics beyond log.

## 15. Notification privacy i sadržaj

Alert details se šalju emailom, in-app i Teams webhookom. Catalog/presentation uglavnom koriste operativne agregate, ali JSON details i inbound errors u dashboardu mogu sadržati identifikatore. Teams webhook je vanjski recipient bez data classification/tenant ownership potvrde.

Extra email recipients su settings stringovi i mogu biti izvan organizacije. Nema domain allowliste, recipient verification, consent ili per-alert classification. `sendTest` pomaže provjeriti kanal, ali ne dokazuje ownership. Za security/captcha/login signale potrebno je minimizirati detalje.

## 16. Test dokaz

Pokrenuto svih 12 direktnih suiteova:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  $(find src/modules/ops-health -name '*.spec.ts' -print | sort)
```

Rezultat:

- **5/12 suiteova prošlo**;
- **7/12 compile-blockirano**;
- **44/44 izvršena testa prošla**.

Prošli suiteovi pokrivaju signal evaluator, state machine, Redis store, HTTP metrics i presentation. Blokirani su notifier channels, engine integration, configuration, runner, service, watchdog i catalog dependency chain. Uzroci su nedostajući generated Prisma client/delegati (`user`, `opsAlert`, `appSetting`, `notificationEmailDelivery`, `integrationJob`, `inboundMailboxState`, `$queryRaw`, `$transaction`, audit client) i posljedični TS tipovi.

Nema izvršenog real Postgres partial-index/state testa, real Redis prefix/failover testa, BullMQ stalled-lock testa, SMTP/Teams partial retry E2E-a, crash-after-claim testa, multi-replica watchdog testa ni Docker outage drill-a.

## 17. Pozitivni nalazi

1. View/manage/receive permissions su razdvojene.
2. DTO validation ograničava silence trajanje/reason i history limit.
3. Acknowledge + audit su u jednoj DB transakciji.
4. Partial unique DB indeks sprečava više otvorenih alarma po keyu.
5. Notify CAS smanjuje duplicate send između replika.
6. Health round izoluje pojedinačne signal greške.
7. Watchdog ima dedicated Redis connection, lock, canary i cold-start grace.
8. DB-down fallback ne zavisi od settings baze.
9. Teams fetch ima timeout i redirect disable.
10. Email user deliveries koriste dedupe ledger.
11. Silence ima maksimalno osam sati i obavezan reason.
12. Snapshot ima TTL; history i query imaju limite.
13. 44 izvršena testa su zelena.

## 18. Registar nalaza

| ID        | Severity | Nalaz                                                                                               | Status   |
| --------- | -------- | --------------------------------------------------------------------------------------------------- | -------- |
| BA-ops-01 | P1       | Periodični probe timeoutovi ne otkazuju DB/Redis/BullMQ work i mogu akumulirati hung operacije       | otvoreno |
| BA-ops-02 | P1       | Notification se claimuje prije send-a; crash poslije claima može trajno izgubiti početni alarm      | otvoreno |
| BA-ops-03 | P1       | Uspjeh jednog kanala zatvara događaj; neuspjeli email/Teams kanal nema vlastiti retry                | otvoreno |
| BA-ops-04 | P1       | Recipient query tiho ograničava primaoce na prvih 50 i preskače ostale ovlaštene primaoce           | otvoreno |
| BA-ops-05 | P1       | Fallback alarm lifecycle/dedupe je samo u memory Mapama i gubi se/duplira pri restartu/replikama     | otvoreno |
| BA-ops-06 | P1       | Teams/uptime outbound URL nema host/IP allowlist; operativni payload/requests imaju SSRF egress rizik | otvoreno |
| BA-ops-07 | P1       | Silence/DLQ baseline mijenjaju Redis prije audita; audit failure ostavlja neauditiranu globalnu promjenu | otvoreno |
| BA-ops-08 | P2       | Silence je Redis-only i može nestati/ignorirati se tokom outagea, restorea ili flush-a               | otvoreno |
| BA-ops-09 | P2       | Extra email i Teams deliveries nemaju durable per-recipient/channel ledger                          | otvoreno |
| BA-ops-10 | P2       | Prvi nonzero DLQ baseline se prihvata bez alarma; manual baseline koristi vremenski torn snapshot    | otvoreno |
| BA-ops-11 | P2       | HTTP/WS metric batch se trajno odbacuje na Redis grešci; pipeline partial errors se ne provjeravaju  | otvoreno |
| BA-ops-12 | P2       | Redis keyPrefix handling za WS heartbeat SCAN/MGET je nedosljedan i može proizvesti lažni unknown   | otvoreno |
| BA-ops-13 | P2       | SCAN failure se tretira kao heartbeat seen, pa metrics outage može izgledati kao nula                | otvoreno |
| BA-ops-14 | P2       | Ručna queue lista i parcijalni probe failure ne izlažu kompletan expected-vs-observed coverage       | otvoreno |
| BA-ops-15 | P2       | OpsAlert nema enum/check/details schema-size invariant; state/Redis/delivery nisu atomski            | otvoreno |
| BA-ops-16 | P2       | Unknown signal često postaje inactive bez posebnog collector-degraded alarma                        | otvoreno |
| BA-ops-17 | P2       | Dashboard vraća raw inbound `lastError`/mailbox detalje view permission holderima                    | otvoreno |
| BA-ops-18 | P2       | History purge je best-effort, neauditiran i nema legal-hold/export checkpoint                       | otvoreno |
| BA-ops-19 | P2       | 7/12 suiteova compile-blockirano; nema crash/failover/multi-replica/outage-drill dokaza             | otvoreno |
| BA-ops-20 | P3       | Event-loop koristi mean umjesto p95/max i aborted HTTP responses nisu brojani                       | otvoreno |
| BA-ops-21 | P3       | Acknowledge mutacija koristi view permission umjesto zasebne explicit capability                    | otvoreno |
| BA-ops-22 | P3       | Alert settings se čitaju bez atomarne revision granice; invalid values padaju na default            | otvoreno |
| BA-ops-23 | P3       | Extra recipienti nemaju domain/ownership verifikaciju ni truncation/coverage indikator              | otvoreno |
| BA-ops-24 | P3       | `sendTest` vanjski side-effect nastaje prije audita i nema idempotency key iz requesta               | otvoreno |

## 19. Ključne korekcije

- **01:** driver-native cancellation/deadlines, round deadline, lock renewal i single-flight.
- **02–05,09:** per-channel/recipient durable outbox, leased claim/recovery, fallback external durable pager i paginirani recipient fan-out.
- **06:** canonical HTTPS provider allowlist, private-IP/DNS rebinding zaštita i egress firewall.
- **07–08,10:** durable DB command/source-of-truth za silence/baseline sa transactional auditom i Redis projekcijom.
- **11–13,20:** metric retry buffer/bounded spool, pipeline result provjera, prefix-safe Redis access i explicit unknown.
- **14–16:** machine-generated expected signal registry i collector-degraded alarms.
- **15,18:** Prisma enums/checks/details schema, durable state transitions i governed retention.
- **17,23:** redakcija i recipient/domain data-classification politika.
- **19,21–24:** test otključavanje, zasebne permissions, atomic config snapshot i idempotent audited test command.

## 20. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   4,20 |
| B. API i ugovori             |    12% |   4,40 |
| C. Auth/authz/scope          |    15% |   5,20 |
| D. Poslovna pravila/stanje   |    13% |   3,20 |
| E. Podaci/Prisma/transakcije |    13% |   3,10 |
| F. Sigurnost/privatnost      |    12% |   3,20 |
| G. Async/integracije         |     8% |   2,70 |
| H. Testovi/dokazivost        |    10% |   3,30 |
| I. Operativnost/perf.        |     7% |   2,90 |
| **Ukupno**                   | **100%** | **3,68/10** |

Ponderisani rezultat je približno **3,68/10**. Sedam P1 nalaza pogađa samu alarm delivery funkciju, pa pozitivna širina signala i dobra pure logika ne mogu opravdati višu enterprise ocjenu.

## 21. Fazni plan

### Faza 0 — safety net

Otključati svih 12 suiteova; real Postgres/Redis/BullMQ harness; crash-after-claim, partial channel, >50 recipients, prefix, Redis outage, multi-replica watchdog i SSRF testovi.

### Faza 1 — delivery outbox

Per-event/channel/recipient delivery rows, lease/reclaim, retry/DLQ, mandatory channel policy i provider reconciliation.

### Faza 2 — control-plane state

DB source-of-truth za silence i baseline, transactional audit, idempotent command IDs i Redis cache/projection.

### Faza 3 — probe i metric reliability

Hard cancellation, global round budget, retry/spool metric batches, explicit unknown/degraded signal i generated queue coverage.

### Faza 4 — fallback i egress

Independent durable pager, cluster dedupe, production fallback gate, URL allowlist/private-IP zaštita i recipient ownership policy.

### Faza 5 — schema, privacy i finalni gate

OpsAlert enums/details schema, redaction, governed retention i kompletan failover/load/outage drill na finalnom SHA-u.

## 22. Acceptance i presuda

1. Crash poslije delivery claima ne može izgubiti alarm.
2. Svaki obavezni kanal/recipient ima zaseban retryable durable status.
3. Svi legitimni receiveri su obuhvaćeni ili sistem eksplicitno odbija invalid recipient konfiguraciju.
4. Fallback preživljava restart i koordinira replike izvan primarnog failure domaina.
5. Nijedan outbound URL ne može ciljati neodobren/private endpoint.
6. Silence i DLQ acknowledgement su durable i atomski auditirani.
7. Probe deadline stvarno prekida underlying work.
8. Metric outage je `unknown/degraded`, nikada lažna nula, a batch se bounded retryja.
9. Expected queue/signal coverage je automatski dokaziva.
10. Svih 12 suiteova i crash/failover/multi-instance/outage drill matrica prolaze.

Modul pokazuje ozbiljan dizajnerski trud i široku observability pokrivenost, ali monitoring sistem se ocjenjuje prema pouzdanosti najkritičnijeg alarma. Trenutni claim-before-send, globalni channel success, memory fallback i neauditirane Redis-first kontrole znače da se incident može detektovati, ali ne i pouzdano dostaviti ili dokazati. Iskren baseline je **3,68/10**.
