# Backend audit 10 — `security-audit-webhook`

**Status:** audit završen  
**Datum:** 2026-10-22  
**Rizik modula:** visok  
**Baseline ocjena:** **5,92/10**  
**Nalazi:** 3 P1, 6 P2, 2 P3

## 1. Executive summary

Modul ima jasnu worker-only arhitekturu, determinističan `(createdAt,id)` kursor, bounded batch/tick, timeout, zabranu redirecta, HMAC-SHA256 potpis nad tačnim tijelom i privacy-safe status model. Uspješan odgovor pomjera kursor tek nakon 2xx, a crash poslije prijema i prije cursor writea daje očekivanu at-least-once duplikaciju koju receiver može ukloniti po event ID-ju.

Baseline je ipak **5,92/10**. Tri P1 problema narušavaju svrhu sigurnosnog izvoza: nakon 24 sata kvarova backlog se svjesno i nepovratno preskače bez DLQ-a; prvi tick nakon uključivanja postavlja kursor na tada najnoviji red i time gubi događaje nastale između administrativnog uključivanja i ticka; izlazna URL politika dozvoljava proizvoljan HTTP/HTTPS cilj, privatne/link-local/loopback adrese i plaintext HTTP, pa privilegovana konfiguracija postaje blind SSRF i kanal za nešifrovani izvoz audit podataka.

Nema P0 jer konfiguracija nije javno dostupna, secret se ne vraća kroz API, redirecti su odbijeni i nije pronađen neposredan neautentificirani entrypoint. Popravke se ne implementiraju prije završetka kompletnog backend audita.

## 2. Scope i inventar

Direktna površina:

- 11 produkcijskih TypeScript fajlova, 654 aktuelne fizičke linije (inventar snapshot: 665 LOC);
- 2 servisa: delivery/config i status;
- BullMQ processor + scheduler, Prisma store, HTTP poster, batch/signature model i dva Nest modula;
- 2 direktna spec fajla;
- Prisma `SecurityAuditWebhookState` i migracija;
- settings definicije za `enabled`, `url` i `secret`;
- consumer status ruta u modulu `security`, ops-health signal/alarm i operativna dokumentacija.

Pregledane granice: Settings secret reader, audit-log producer/schema, BullMQ repeat helper, worker wiring, fetch/AbortController, status API i ops alarm. Detaljni audit settings/audit-log problema ostaje u modulima 07/08; ovdje se ocjenjuje njihov direktni uticaj na izvoz.

## 3. Arhitektura i lifecycle

### 3.1. Konfiguracija i aktivacija

Worker svaki minut čita tri postavke. Export je efektivno isključen ako je `enabled=false`, URL prazan ili secret prazan. Dok je isključen, svaki tick pomjera cursor na najnoviji settled događaj, bez backfilla.

Kada je stanje bez cursora, i **nakon što je konfiguracija već uključena**, delivery opet postavlja cursor na najnoviji settled red. Ne postoji activation watermark zapisan u istoj transakciji sa settings promjenom. Zbog toga prvi tick preskače ne samo historiju prije uključivanja nego i događaje poslije uključivanja, sve do inicijalizacije cursora.

### 3.2. Selekcija i batch

Store bira samo `auth.*` i `security.*`, `createdAt <= now-10s`, nakon leksikografskog `(createdAt,id)` cursora, uz `take=100`. Tick šalje najviše deset batch-eva. Tijelo sadrži schema version, source, sentAt i audit polja uključujući metadata.

Cursor je stabilan za normalne commitove, ali PostgreSQL `now()` semantika i dugotrajna transakcija mogu kreirati red sa starim `createdAt` koji commitira nakon što je cursor već prošao tu tačku. Settle prozor od 10 sekundi smanjuje, ali ne uklanja gubitak; dokumentacija ga eksplicitno prihvata.

### 3.3. Transport i potpis

Poster prihvata `http:` i `https:`, bez URL credentials. Šalje HMAC-SHA256 nad `timestamp.body`, ima rok 5 sekundi, ne prati redirect i ne čita/loguje response body. Receiver mora sam provjeriti timestamp freshness i deduplicirati event ID.

Validacija ne radi DNS/IP policy, ne pinna resolve rezultat i ne blokira loopback, link-local, cloud metadata ili druge interne servise. Interni ciljevi su namjerno dozvoljeni, ali nema eksplicitnog allowlista/cidr policyja. HTTP šalje audit payload bez transportne enkripcije. Secret nema modulsku minimalnu entropy/length validaciju.

### 3.4. Failure, retry i status

Non-2xx/network/timeout zadržavaju cursor i isti batch ide narednog minuta. Nakon 24 sata failure streaka delivery broji sve pending događaje, skače cursor na najnoviji settled red i trajno ih odbacuje. Ne postoji payload DLQ, replay API niti export manifest.

Processor hvata DB/settings/delivery exception i ne baca ga dalje, pa BullMQ job završava kao uspješan; `attempts`, backoff i retained failed jobs ne predstavljaju stvarne infrastrukturne kvarove. Ti kvarovi ne ažuriraju ni `pendingSince`/`lastErrorCode`, pa status može ostati `ok` dok tickovi ne rade.

## 4. Entrypoint/permission/scope matrica

| Površina         | Pozivalac/guard             | Scope                 | Tajne/podaci          | Napomena                     |
| ---------------- | --------------------------- | --------------------- | --------------------- | ---------------------------- |
| repeat scheduler | worker startup              | globalno              | bez payload-a         | jedan scheduler ID           |
| BullMQ processor | worker queue                | globalno              | pokreće delivery      | exception se guta            |
| config loader    | interni worker DI           | tri private settings  | čita decrypted secret | nije HTTP ruta               |
| Prisma store     | interni worker DI           | `auth.*`,`security.*` | puni audit metadata   | globalni export              |
| HTTP poster      | interni worker              | operatorov URL        | potpisani batch       | proizvoljan HTTP(S) target   |
| status service   | security metrics controller | agregatno             | bez URL/secret/body   | SuperAdmin guard u consumeru |

Modul nema vlastiti javni kontroler. Vertikalna kontrola konfiguracije nasljeđuje SuperAdmin settings API. Horizontalni/OU scope nije primjenjiv jer je namjena globalni SIEM export; to mora ostati eksplicitna enterprise policy odluka. Najveća privilege granica je egress: kompromitovan ili zlonamjeran SuperAdmin može usmjeriti globalne audit podatke i server-side POST prema proizvoljnom mrežnom cilju.

## 5. Podaci, Prisma i konkurencija

`SecurityAuditWebhookState` je singleton bez version/CAS kolone. `loadState` i `saveState` su odvojeni upserti. BullMQ normalno predaje jedan due job jednom workeru, ali baza ne brani paralelni manual/duplicate/stalled execution. Paralelni tickovi mogu duplo poslati batch, izgubiti increment brojača, regresirati cursor ili prepisati failure state. Receiver dedupe ublažava samo duplikate, ne netačne lokalne countere/cursor race.

Brojači su Prisma/PostgreSQL `Int`/`INTEGER`; dugotrajan veliki sistem može doseći overflow. `lastErrorCode` nema schema bound. State ne čuva activation timestamp, secret/key version, destination identity, last attempted cursor, backlog count ni drop manifest.

Batch je row-bounded, ali ne byte-bounded. Audit `metadata` je generičan i nema centralni byte/depth limit (BA-audit-log-07), pa 100 velikih redova može napraviti veliki JSON/HMAC/fetch payload i ponovljeni memory/egress pritisak.

## 6. Sigurnost i privatnost

Pozitivno: secret koristi internal-use reader; URL, secret i response body se ne loguju; redirect je `error`; response body se canceluje; status model ne sadrži destination ni tajnu; HMAC pokriva timestamp i tačan body.

Ograničenja:

- HMAC daje autentičnost/integritet, ne povjerljivost;
- HTTP omogućava pasivno čitanje audit metadata;
- proizvoljan host/port i DNS resolution čine blind SSRF mogućim;
- nema mTLS/certificate pinning/CA policy niti receiver identity vezivanja uz cursor;
- weak secret je prihvatljiv ako je samo neprazan;
- promjena secret/URL-a nema key/destination epoch u payloadu/stateu;
- upstream metadata može sadržati PII ili neočekivane tajne; modul ga šalje bez dodatne schema/redaction kontrole.

## 7. Testovi i izvršeni gateovi

Direktni testovi pokrivaju action filter, stabilno tijelo, HMAC, scheme/credentials/URL length, redirect option, HTTP/network mapping, no-backfill, ordering, retry, 24h drop, batch stop, activation behavior, settle lag, settings prerequisites i status model.

Izvršeno:

```bash
cd backend
npx jest --runInBand --runTestsByPath \
  src/modules/security-audit-webhook/security-audit-webhook.spec.ts \
  src/modules/security-audit-webhook/security-audit-webhook.status-model.spec.ts
```

Rezultat: **1/2 suitea prošao, 1 compile-blocked; 5/5 izvršenih testova prošlo**. Glavni suite je blokiran nedostajućim generated Prisma klijentom kroz `SettingsService.appSetting`. Status-model suite je zelen. Ovo je environment-blocked, ne funkcionalni failure.

Nema direktnog E2E testa sa stvarnim PostgreSQL + Redis/BullMQ + HTTP receiverom. Postojeći testovi ne dokazuju SSRF/DNS rebinding, TLS, activation race, long-transaction late commit, parallel tick/CAS, worker crash između POST/save, state DB outage, byte limit, secret entropy/rotation ni DLQ replay.

## 8. Pozitivni nalazi

1. Worker-only delivery ne usporava API request.
2. Action scope je duplicirano ograničen u DB queryju i post-filteru.
3. `(createdAt,id)` daje determinističan redoslijed za jednaka vremena.
4. Cursor se nakon normalnog HTTP failurea ne pomjera.
5. Event ID omogućava receiver dedupe za at-least-once delivery.
6. HMAC pokriva timestamp i tačan serialized body.
7. Timeout i redirect refusal smanjuju transportni rizik.
8. URL, secret i response body se ne pohranjuju u status/log.
9. Batch i broj batch-eva po ticku su row-bounded.
10. Status read model je minimalan i privacy-safe.
11. Ops-health ima warning/critical signal za evidentiran failure streak.

## 9. Registar nalaza

| ID                           | Severity | Nalaz                                                       | Status   |
| ---------------------------- | -------- | ----------------------------------------------------------- | -------- |
| BA-security-audit-webhook-01 | P1       | 24h failure nepovratno odbacuje sigurnosni backlog          | otvoreno |
| BA-security-audit-webhook-02 | P1       | Aktivacija preskače događaje nastale prije prvog ticka      | otvoreno |
| BA-security-audit-webhook-03 | P1       | Proizvoljan HTTP(S) cilj omogućava SSRF i plaintext izvoz   | otvoreno |
| BA-security-audit-webhook-04 | P2       | Settle cursor može preskočiti kasno commitovane redove      | otvoreno |
| BA-security-audit-webhook-05 | P2       | State nema CAS/lock za paralelne tickove                    | otvoreno |
| BA-security-audit-webhook-06 | P2       | Processor skriva infrastrukturni kvar od BullMQ/statusa     | otvoreno |
| BA-security-audit-webhook-07 | P2       | Secret nema minimalnu entropy/rotation epoch politiku       | otvoreno |
| BA-security-audit-webhook-08 | P2       | Batch nema byte/depth budget niti outbound redaction schema | otvoreno |
| BA-security-audit-webhook-09 | P2       | Nema storage-backed end-to-end/concurrency dokaza           | otvoreno |
| BA-security-audit-webhook-10 | P3       | Status/counter model je nedovoljan za reconciliation        | otvoreno |
| BA-security-audit-webhook-11 | P3       | `INTEGER` kumulativni brojači mogu overflowati              | otvoreno |

## 10. Detaljni nalazi

### BA-security-audit-webhook-01 — 24h failure nepovratno odbacuje sigurnosni backlog

**Severity/status:** P1, otvoreno.  
**Dokaz:** `SecurityAuditWebhookDelivery.runTick` nakon `securityAuditWebhookGiveUpMilliseconds` broji redove, pomjera cursor na newest i čuva samo `droppedTotal`.  
**Uticaj/root cause:** sigurnosni događaji se trajno gube iz eksternog SIEM toka tokom dužeg incidenta; ne postoji DLQ/replay dokaz. Fixed give-up je tretiran kao retention, ne kao delivery failure.  
**Korekcija:** durable outbox/DLQ sa event ID/cursor rangeom, bounded retention po eksplicitnoj policy, operator replay i alarm; cursor se ne smije pretvarati da je drop delivery.  
**Acceptance:** outage >24h ne briše payload/range; nakon oporavka replay isporučuje svaki događaj ili dokumentovan terminalni quarantine.  
**Owner/veličina/zavisnosti:** security/audit + platform, L; audit-log immutable ID/schema.

### BA-security-audit-webhook-02 — Aktivacija preskače događaje nastale prije prvog ticka

**Severity/status:** P1, otvoreno.  
**Dokaz:** ako je `state.cursor === null`, enabled grana poziva `newestCursor(settledBefore)` i tek od tog reda počinje budući export.  
**Uticaj/root cause:** obećanje „događaji nakon uključivanja“ nije tačno; prozor do prvog ticka (tipično do minute, uz settle) je izgubljen. Settings promjena i activation watermark nisu povezani.  
**Korekcija:** pri tranziciji false→true transakcijski/durable zapisati activation cursor/watermark prije potvrde promjene; worker koristi upravo taj anchor.  
**Acceptance:** događaj commitovan nakon potvrđenog enablea uvijek se izvozi, uključujući restart i tick delay.  
**Owner/veličina/zavisnosti:** settings + webhook + audit-log, M/L.

### BA-security-audit-webhook-03 — Proizvoljan HTTP(S) cilj omogućava SSRF i plaintext izvoz

**Severity/status:** P1, otvoreno.  
**Dokaz:** `isValidAuditWebhookUrl` i settings validator provjeravaju samo scheme/credentials; dokumentacija namjerno dozvoljava interne adrese i HTTP.  
**Uticaj/root cause:** SuperAdmin/session compromise može napraviti server-side POST prema loopback/link-local/metadata/internom control planeu i izvesti globalni audit payload bez TLS-a. HMAC ne štiti povjerljivost.  
**Korekcija:** HTTPS-by-default/required, eksplicitni egress allowlist ili administrativno odobren CIDR/hostname, DNS resolve + connect-time IP policy protiv rebindinga, blokada metadata/loopback, opcioni mTLS. Internal HTTP samo formalni risk exception.  
**Acceptance:** testovi blokiraju zabranjene IPv4/IPv6/DNS-rebinding ciljeve; network policy i TLS receiver identity su dokazani.  
**Owner/veličina/zavisnosti:** security/platform, L.

### BA-security-audit-webhook-04 — Settle cursor može preskočiti kasno commitovane redove

**Severity/status:** P2, otvoreno.  
**Dokaz:** kursor je po `createdAt,id`, settle je samo 10s; dokumentacija priznaje da stariji late insert ostaje iza cursora.  
**Uticaj/root cause:** duga DB transakcija, clock/import edge ili backfill može trajno izostaviti relevantan događaj. Vremenski heuristic nije commit sequence.  
**Korekcija:** monotoni ledger sequence/outbox ID dodijeljen pri commit-safe appendu ili overlap scan sa durable dedupe; ne oslanjati se na wall-clock settle.  
**Acceptance:** transakcija otvorena >settle i commitovana nakon novijih redova ipak se tačno jednom/at-least-once izveze.  
**Owner/veličina/zavisnosti:** audit-log + webhook, L; BA-audit-log chain model.

### BA-security-audit-webhook-05 — State nema CAS/lock za paralelne tickove

**Severity/status:** P2, otvoreno.  
**Dokaz:** odvojeni `loadState`/`saveState` upsert bez versiona ili advisory locka. BullMQ lock je normalna zaštita, ali DB invariant ne postoji.  
**Uticaj/root cause:** stalled/manual/duplicate execution može izgubiti counter increment, regresirati cursor/failure state i proizvesti nekontrolisane duplikate.  
**Korekcija:** DB lease/advisory lock ili optimistic version CAS; monotono cursor pravilo i atomic counter increments.  
**Acceptance:** dva paralelna ticka imaju jednog ownera ili conflict/retry bez cursor regresije i izgubljenih brojača.  
**Owner/veličina/zavisnosti:** webhook/platform, M.

### BA-security-audit-webhook-06 — Processor skriva infrastrukturni kvar od BullMQ/statusa

**Severity/status:** P2, otvoreno.  
**Dokaz:** `SecurityAuditWebhookProcessor.process` catch samo loguje i resolvea; job nije failed, a delivery state se ne mijenja ako config/store baci prije savea.  
**Uticaj/root cause:** BullMQ attempts/backoff/failed retention su efektivno zaobiđeni, status/alarm može ostati `ok`, a operator vidi samo log.  
**Korekcija:** klasifikovati exception, durable evidentirati tick failure kada je DB dostupan i rethrow za queue retry/failed job; zaseban health signal za state DB outage.  
**Acceptance:** injected settings/DB exception označava job failed, aktivira retry i vidljiv alarm bez worker crasha.  
**Owner/veličina/zavisnosti:** webhook + ops-health, S/M.

### BA-security-audit-webhook-07 — Secret nema minimalnu entropy/rotation epoch politiku

**Severity/status:** P2, otvoreno.  
**Dokaz:** secret definicija zahtijeva samo da je postavljen; delivery payload/header nemaju key ID, state nema key epoch.  
**Uticaj/root cause:** kratka tajna omogućava offline brute force nad poznatim bodyjem; rotacija može napraviti nedijagnosticiran outage i nema dual-key prijelaza.  
**Korekcija:** minimalno 32 random bytes ili entropy policy, generated option, `keyId`/epoch, dual-key grace i redacted rotation audit.  
**Acceptance:** weak secrets se odbijaju, receiver deterministički bira key, rotacija nema gubitak/backlog drop.  
**Owner/veličina/zavisnosti:** settings + webhook, M.

### BA-security-audit-webhook-08 — Batch nema byte/depth budget niti outbound redaction schema

**Severity/status:** P2, otvoreno.  
**Dokaz:** limit je 100 redova, ali `metadata: unknown` se direktno JSON serializuje; nema byte/depth/action schema provjere.  
**Uticaj/root cause:** veliki ili osjetljivi metadata payload povećava memoriju/egress/retry load i može izvesti PII/tajnu koju je producer pogrešno zapisao.  
**Korekcija:** action schema registry, sensitivity/redaction policy i maksimalni event/batch byte/depth budget sa quarantineom, nikad silent dropom.  
**Acceptance:** oversized/cikličan/neodobren metadata ne ruši tick i završava u vidljivom quarantine toku; tajne ne napuštaju sistem.  
**Owner/veličina/zavisnosti:** webhook + audit-log, M/L; BA-audit-log-07/11.

### BA-security-audit-webhook-09 — Nema storage-backed end-to-end/concurrency dokaza

**Severity/status:** P2, otvoreno.  
**Dokaz:** dva mock/pure speca; jedan lokalno compile-blocked. Nema stvarnog Postgres/Redis/BullMQ/HTTP receiver testa.  
**Uticaj/root cause:** najvažnije delivery garancije, restart i race ponašanje nisu izvršno dokazane.  
**Korekcija:** hermetički integration stack, controllable receiver i fault injection za crash, timeout, DNS, late commit, parallel worker i state failure.  
**Acceptance:** cijela matrica prolazi u CI-u na finalnom SHA-u.  
**Owner/veličina/zavisnosti:** QA/platform, L.

### BA-security-audit-webhook-10 — Status/counter model je nedovoljan za reconciliation

**Severity/status:** P3, otvoreno.  
**Dokaz:** status pokazuje counters/times/error, ali nema backlog, last attempted/delivered event, destination/key epoch, drop range ni worker heartbeat.  
**Uticaj/root cause:** `ok` ne dokazuje kompletnost, a operator ne može povezati receiver stanje sa cursorom bez DB analize.  
**Korekcija:** privacy-safe lag/backlog/heartbeat/epoch/range hash i reconciliation runbook/API.  
**Acceptance:** operator može dokazati do kojeg događaja je receiver kompletan bez otkrivanja URL-a/tajne.  
**Owner/veličina/zavisnosti:** webhook + ops, M.

### BA-security-audit-webhook-11 — `INTEGER` kumulativni brojači mogu overflowati

**Severity/status:** P3, otvoreno.  
**Dokaz:** `sentTotal`, `failedTotal`, `droppedTotal` su Prisma `Int`/PostgreSQL `INTEGER`.  
**Uticaj/root cause:** dugotrajan/high-volume sistem može prekinuti state save nakon ~2,1 milijarde događaja/pokušaja.  
**Korekcija:** `BigInt/BIGINT` ili resettable window counters uz lifetime metric; API string/safe-number ugovor.  
**Acceptance:** migracija čuva vrijednosti, veliki increment ne overflowa, status serializacija je stabilna.  
**Owner/veličina/zavisnosti:** webhook/data, S/M.

## 11. Baseline score

| Presjek                      |   Težina |      Ocjena | Obrazloženje                                                       |
| ---------------------------- | -------: | ----------: | ------------------------------------------------------------------ |
| A. Arhitektura i granice     |      10% |        8,40 | dobra worker/store/poster separacija                               |
| B. API i ugovori             |      12% |        7,40 | verzioniran payload i status, ali slab reconciliation/epoch ugovor |
| C. Auth/authz/scope          |      15% |        6,20 | naslijeđen SuperAdmin scope; egress privilege granica slaba        |
| D. Poslovna pravila/stanje   |      13% |        4,80 | activation i 24h drop krše delivery obećanje                       |
| E. Podaci/Prisma/transakcije |      13% |        5,20 | cursor/state bez commit sequencea, CAS-a i DLQ-a                   |
| F. Sigurnost/privatnost      |      12% |        5,00 | HMAC/redaction status dobri; SSRF/HTTP/metadata rizik              |
| G. Async/integracije         |       8% |        5,10 | retry postoji, ali drop i swallowed queue failure su ozbiljni      |
| H. Testovi/dokazivost        |      10% |        5,20 | dobri unit scenariji, bez pravog integration dokaza                |
| I. Operativnost/perf.        |       7% |        6,20 | alarmi/boundovi postoje, nema byte budgeta/reconciliationa         |
| **Ukupno**                   | **100%** | **5,92/10** | tri P1; ponderisana vrijednost ostaje ispod P1 capa 7,49           |

## 12. Fazni plan popravki

### Faza 0 — reprodukcija i safety net

- Testirati >24h outage bez dropa, enable→event→delayed tick, SSRF IPv4/IPv6/DNS, long transaction, paralelni tick, processor exception i oversized metadata.
- Osigurati generated Prisma klijent i pravi Postgres/Redis/receiver CI fixture.
- Rollback: samo testovi; acceptance: svaki P1 prvo reproduciran.

### Faza 1 — P1 sigurnost i integritet

- Zamijeniti drop durable DLQ/outbox + replayom.
- Transakcijski vezati enable transition za activation watermark.
- Uvesti HTTPS/egress destination policy, DNS/connect-time provjeru i network-level deny za metadata/control plane.
- Rollback: additive schema/feature flag; nikad rollback na silent drop ili unrestricted egress.

### Faza 2 — delivery i crypto ugovori

- Key ID/epoch, strong-secret validation, dual-key rotation i receiver contract.
- Payload/action schema, byte/depth budget i quarantine semantics.
- Eksplicitno verzionirati destination epoch i schema compatibility.

### Faza 3 — podaci i konkurencija

- Commit-safe monotoni export sequence/outbox.
- State version/CAS ili lease; atomic counters i `BIGINT` migracija.
- Backfill/reconciliation manifest i indeksi za sequence/status.

### Faza 4 — worker i failure semantics

- Rethrow/classify processor kvarove za BullMQ retry/failed retention.
- Backoff+jitter/circuit policy, DLQ worker, replay ownership i restart-safe leases.
- Heartbeat i DB/settings/queue odvojeni health signali.

### Faza 5 — testovi, observability i performanse

- End-to-end at-least-once/dedupe, crash-after-POST, receiver slowdown, failover i load/large metadata testovi.
- Backlog/lag/last-delivered/range-hash metrike i alerti.
- Security review SSRF/TLS/key rotation i disaster recovery rehearsal.

### Faza 6 — dokumentacija i finalni gate

- Uskladiti ops/user guide: nema accepted late-loss/drop ponašanja.
- Dokumentovati receiver verification, dedupe, TLS/mTLS, allowlist, replay i retention.
- Pokrenuti lint/build, oba direktna suitea, settings/audit/ops povezane suiteove i novi E2E/integration gate; preračunati audit na finalnom SHA-u.

## 13. Rizik, rollback i acceptance

Najveći migracijski rizik je prelazak sa scan cursora na outbox/sequence bez duplog ili preskočenog događaja. Uvesti dual-read shadow poređenje i cutoff manifest. Destination policy može blokirati postojeće interne HTTP receivere; omogućiti vremenski ograničen, auditiran exception, ne tihi globalni bypass. Key rotation mora podržati grace prozor.

Globalni acceptance:

1. Nijedan događaj poslije potvrđenog enablea nije preskočen.
2. Outage duži od 24h ne uništava payload/range; replay je auditiran i idempotentan.
3. Zabranjeni loopback/link-local/metadata/DNS-rebinding cilj nije dostupan.
4. Produkcijski transport potvrđuje TLS receiver identity; HTTP traži formalni exception.
5. Duga transakcija i paralelni tick ne gube događaj niti regresiraju cursor.
6. DB/settings exception je vidljiv BullMQ-u, statusu i alarmu.
7. Weak secret je odbijen, key rotation je verzionirana i bez gubitka.
8. Event i batch imaju byte/schema/privacy budget sa quarantineom.
9. Operator može dokazati backlog i last-complete range.
10. Storage-backed integration matrica prolazi na finalnom SHA-u.

## 14. Traceability

| Nalaz                        | Kod/dokaz                   | Test prihvata                  | Faza    |
| ---------------------------- | --------------------------- | ------------------------------ | ------- |
| BA-security-audit-webhook-01 | delivery give-up grana      | >24h outage + replay           | 0–1/3/4 |
| BA-security-audit-webhook-02 | null cursor enabled grana   | enable-event-delayed tick      | 0–1/3   |
| BA-security-audit-webhook-03 | URL validator/poster        | SSRF/TLS/DNS matrix            | 0–1     |
| BA-security-audit-webhook-04 | `(createdAt,id)` + settle   | long transaction commit        | 0–3     |
| BA-security-audit-webhook-05 | load/save upsert            | parallel/stalled tick          | 0–3     |
| BA-security-audit-webhook-06 | processor catch             | DB/settings exception retry    | 0–4     |
| BA-security-audit-webhook-07 | secret setting/HMAC headers | weak key + dual rotation       | 0–2     |
| BA-security-audit-webhook-08 | metadata serialization      | byte/depth/privacy quarantine  | 0–2/5   |
| BA-security-audit-webhook-09 | dva direktna speca          | full integration matrix        | 0–6     |
| BA-security-audit-webhook-10 | status model                | reconciliation/heartbeat       | 0–5     |
| BA-security-audit-webhook-11 | Prisma `Int` counters       | BIGINT migration/serialization | 0–3     |

## 15. Konačna audit presuda i pretpostavke

Implementacija je uredna kao mali best-effort webhook, ali trenutne garancije nisu dovoljne za enterprise sigurnosni audit kanal: namjerni drop, activation gap i unrestricted/plaintext egress spuštaju baseline na 5,92/10. Modul ne predstavlja external WORM anchor za audit chain: receiver dobija odabrane događaje, HMAC shared secretom, uz moguće preskakanje i bez kriptografskog vezivanja chain checkpointa.

Pretpostavke:

- settings write autorizacija i secret-at-rest tretman naslijeđeni su iz audita 07;
- audit metadata/chain kvalitet naslijeđen je iz audita 08;
- korisnikov potvrđeni Playwright 01–56 prolaz ne sadrži storage-backed webhook delivery scenario;
- interne adrese jesu trenutni namjerni proizvodni zahtjev, ali bez allowlista/network policyja nisu prihvaćene kao sigurna SSRF granica;
- modul 11 — `privacy` ponovo će procijeniti outbound metadata, retention i DSAR/legal-hold posljedice.
