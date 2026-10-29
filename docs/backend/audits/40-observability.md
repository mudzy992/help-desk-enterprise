# Backend audit 40 — `observability`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,08/10**  
**Nalazi:** 4 P1, 10 P2, 4 P3

## 1. Executive summary

`observability` ima dvije različite odgovornosti: veoma osjetljiv Support Bundle export i dva periodična log-based metrics helpera za event-loop lag i broj WebSocket klijenata. Support bundle može sadržati kompletnu konfiguracijsku sliku, cijeli audit chain i do 50.000 recent log zapisa, upakovane u ZIP i vraćene SuperAdminu sa posebnom permission provjerom. Modul ima no-store header, neutralne greške, manifest, feature/include flagove i post-success audit. Event-loop i WebSocket helperi imaju čiste stop funkcije i direktne unit testove.

Baseline je **4,08/10**. Četiri P1 nalaza proizlaze iz kombinacije osjetljivosti i neograničenog synchronous request workflowa. Cijeli audit chain, veliki configuration graph, recent logovi, JSON stringovi, JSZip struktura i finalni ZIP istovremeno se drže u memoriji; nema row/byte limita, streaminga, joba, timeouta, concurrency locka ni rate limita. Više paralelnih SuperAdmin requestova može izazvati memory/CPU/event-loop incident.

Recent logs bez centralne redakcije čuvaju i izvoze proizvoljne logger poruke. Logger hvata string, `Error.message` ili JSON objekat iz svih modula; repo već sadrži logove sa transportnim greškama, adresama, identifikatorima i provider odgovorima. Nema schema-based uklanjanja tokena, cookies, authorization headera, emaila ili poslovnog teksta prije Support Bundle izvoza. Audit export slično uključuje globalni chain i proizvoljne metadata vrijednosti bez export-time privacy filtera.

Configuration snapshot koristi široki config-versioning snapshot, uključujući privatne postavke, routing/SLA/catalog/forms, response template bodies i organizacijske reference. Taj collector nema eksplicitni registry-driven `isSecret` filter na ovoj export granici; oslanja se na trenutnu semantiku `getPrivateSettings()` i raniju klasifikaciju. Nova pogrešno klasifikovana ili buduća sensitive postavka automatski ulazi u bundle. Za ovako širok export nedostaju explicit allowlist, redaction report i automated “no secret key/value” invariant.

Bundle je omogućen po defaultu sa sva tri osjetljiva dijela uključena. Jedan postojeći session SuperAdmina može bez password/MFA step-upa, razloga/ticket reference ili two-person approvala pokrenuti one-click GET download globalnog security/audit/config skupa. Permission i role zaštita su dobre, ali nisu dovoljne za enterprise break-glass export.

Od pet direktnih suiteova četiri prolaze, jedan je compile-blockiran zbog nepotpunog generated Prisma clienta; 12/12 izvršenih testova je zeleno. Nema service/controller integration testa, size/concurrency/load testa, PII/secret redaction testa, interrupted downloada ni audit-failure scenarija. Popravke nisu implementirane.

## 2. Scope i inventar

- 14 produkcijskih TypeScript fajlova;
- 5 direktnih specova;
- 657 direktno izmjerenih produkcijskih LOC (registar navodi 671);
- 1 controller, 1 support bundle servis, configuration loader i helpers;
- 1 SuperAdmin download endpoint;
- config snapshot, audit export i in-process logs kao tri data sourcea;
- event-loop lag i WebSocket client-count log reporteri;
- nema vlastitog Prisma modela, queue joba, object storage lifecyclea ni export ledgera.

Cross-cutting request logger/buffer i config/audit collectori su pregledani jer direktno određuju sadržaj arhive. Njihove šire implementacije bit će ponovo obuhvaćene u jedinici 44.

## 3. Authorization i sensitive-operation model

Controller zahtijeva:

- validnu session autentikaciju;
- role `SUPER_ADMIN`;
- permission `supportBundle.export`;
- validan actor user ID;
- `Cache-Control: no-store`.

To je snažnija zaštita od obične permission provjere. Compatibility spec namjerava dokazati da Admin sa permissionom ne prolazi, a lokalni SuperAdmin prolazi i aktivira bypass audit. Ipak suite trenutno ne kompilira zbog generated Prisma tipova.

Support bundle je mnogo osjetljiviji od standardnog read endpointa. Ne postoji:

- recent-auth/password/MFA step-up;
- obavezni reason, incident/ticket ID ili recipient purpose;
- approval/four-eyes opcija;
- export scope/time range izbor;
- per-user/per-tenant cooldown;
- active-session revocation recheck izvan standardnog guarda;
- watermark u svim fajlovima;
- download confirmation sa procjenom sadržaja/veličine.

Endpoint koristi GET za skupu auditiranu export operaciju. GET olakšava browser prefetch, link scanner i CSRF-style top-level trigger. Napadač ne može pročitati cross-origin odgovor bez dodatne slabosti, ali može aktivirati skupu operaciju u sessionu žrtve. Export treba biti POST command sa CSRF/origin zaštitom, step-up tokenom i asinhronim job ID-em; zasebni jednokratni GET služi samo za preuzimanje već pripremljenog artefakta.

## 4. Neograničena generacija u API procesu

`createArchive()` sekvencijalno:

1. čita konfiguraciju;
2. prikuplja široki config snapshot kroz brojne full-table queryje;
3. učitava cijeli audit chain;
4. serializuje oba skupa u velike stringove;
5. kopira recent log entries u JSONL string;
6. dodaje stringove u JSZip;
7. DEFLATE kompresuje kompletan ZIP u `Buffer`;
8. tek tada zapisuje audit i vraća buffer.

U peak memoriji mogu istovremeno postojati ORM objekti, mapped objekti, JSON stringovi, ZIP entry buffers i finalni compressed buffer. Nema limita broja audit redova, template/form/service zapisa, bytes po dijelu ili ukupnog ZIP-a. Audit `snapshotExportJson()` poziva `listChain()` bez datumske/pagination granice. Config snapshot učitava cijele tabele i template bodies. JSZip nije streaming i kompresija koristi CPU/event loop API procesa.

Nema distributed/single-instance locka, concurrency semafora, request timeouta ni rate limita. Dva taba istog SuperAdmina ili kompromitovan session multipliciraju potrošnju. HTTP disconnect ne prekida DB/serialization/compression work.

Ovo treba premjestiti u bounded worker job sa jednom aktivnom generacijom po tenant/deploymentu, cursor streamovima, per-part/total byte limitima, abortom, progressom, encrypted object storageom, kratkim TTL-om i jednokratnim preuzimanjem. API proces ne smije kompresovati globalni dataset u memoriji.

## 5. Recent logs i redakcija

`RequestContextLogger` kopira svaku logger poruku u `RecentRequestLogBuffer`:

- string ostaje nepromijenjen;
- `Error` daje `message`;
- objekat se `JSON.stringify`-uje;
- context i requestId se čuvaju;
- nema redakcije, dužinskog limita po entryju ni schema allowlista.

Buffer je ograničen na 50.000 entries, ali pojedinačni message nije bounded. Jedan veliki log objekat može potrošiti značajnu memoriju i završiti u bundleu. Log poruke mogu nositi email, ticket/entity ID, URL, provider error body, host, query detalj ili accidental credential. Export samo poziva `JSON.stringify(entry)`.

Potreban je centralni structured logger sa deny/allow redakcijom (`authorization`, `cookie`, token, secret, password, key, certificate, payload/body), field size/depth limitom, PII klasifikacijom i regression corpusom. Support bundle treba napraviti drugi export-time redaction pass i manifest redaction statistics. Raw stack/body ne treba automatski uključiti.

`requestLogRetentionDays` nije stvarna persistent retention politika: buffer ima hard count 50.000, process restart sve briše, a setting se primjenjuje tek kada neko generiše bundle. Do tada ostaje startup default 14 dana. Na prometnom sistemu 50.000 entries može predstavljati minute, a na tihom dane; opis settinga je obmanjujući.

## 6. Audit export privatnost i integritet

Bundle uključuje cijeli audit chain preko `snapshotExportJson()`, bez OU scopea, date windowa ili record limita. SuperAdmin scope je globalan, ali privacy minimization i dalje zahtijeva purpose/time range. Audit metadata potiče iz svih modula i nije centralno ograničena na bezopasna polja; može sadržati identifikatore, prije/poslije vrijednosti i poslovni kontekst.

Support bundle export ne poziva standardni audit export tok sa njegovim scope/config pravilima, nego posebni raw snapshot helper. Ne provjerava chain integrity prije uključivanja i manifest ne navodi chain checkpoint/hash status, record count ni date range. Primatelj ne može potvrditi da je audit fajl kompletan ili tamper-evident.

Export action audit se piše tek nakon kompletne ZIP izgradnje. Ako generation padne, memorija nestane, klijent prekine ili audit insert padne, nema attempt/failure evidencije. Ako audit insert padne, archive se ne vraća, ali skupi sensitive read se već dogodio. Potrebni su immutable export intent prije čitanja, status lifecycle (`REQUESTED/RUNNING/READY/DOWNLOADED/FAILED/EXPIRED`), counts/hashes i download audit.

## 7. Configuration snapshot secret boundary

`collectConfigSnapshot()` spaja public i private settings i dodaje routing, calendars, SLA, services, form versions, OUs, groups, global response template bodies i playbooks. To je operativno korisno, ali mnogo šire od minimalne dijagnostike.

Portable config export u drugom dijelu sistema eksplicitno koristi registry `isSecret` callback. Support bundle collector nema takav callback ni assertion. Čak i ako `getPrivateSettings()` danas isključuje `secret` visibility, sigurnost zavisi od ispravne klasifikacije svake sadašnje i buduće postavke. Nema testa koji iterira registry i dokazuje da nijedan secret key/value/private key/certificate/token nije u outputu.

Potreban je dedicated diagnostic snapshot schema, default-deny field allowlist i registry-driven secret exclusion. Environment-bound IDs/URLs, response template bodies i form content trebaju biti zasebni opt-in dijelovi sa previewom. Bundle manifest treba navesti redacted keys/categories, ne samo filenames.

## 8. Konfiguracija i retention

Configuration loader čita sedam settinga sekvencijalno. Greška se mapira u generički invalid configuration, što ne curi detalje. Booleani moraju biti pravi booleani, što je fail-closed. Numeric vrijednosti imaju samo positive integer provjeru; nema maksimuma.

Posljedice:

- `recentLogsMinutes` može biti ekstremno velik;
- retention days mogu biti ekstremni i uzrokovati neočekivanu memorijsku/DB politiku;
- sedam readova nije atomarni revision snapshot;
- parent enabled i include flagovi mogu biti iz različitih revisiona;
- `auditRetentionDays` se učitava, ali support bundle ga ne koristi;
- u pregledanom modulu nema enforcementa audit retention settinga;
- request log retention setting se primjenjuje side-effectom tek tokom exporta.

Settings trebaju imati maksimalne granice, atomarni snapshot/revision i zaseban startup listener za buffer policy. Audit retention mora imati stvarni scheduled purge/legal-hold model ili setting treba ukloniti/preimenovati.

## 9. Arhiva i artifact security

Pozitivno: filenames su konstante, pa nema ZIP path traversala; archive filename potiče samo iz ISO timestamp-a; response koristi `application/zip`, attachment disposition i no-store. Nema user-supplied ZIP entry names.

Nedostaje:

- SHA-256 manifest za svaki dio i cijeli bundle;
- digital signature/provenance/build SHA;
- encryption at rest/in transit beyond normal HTTPS session;
- password/public-key encryption za slanje vendoru;
- maximum compressed/uncompressed size;
- zip-bomb ratio/report za downstream consumer;
- artifact expiry/revocation jer artifact nije server-side managed;
- explicit `X-Content-Type-Options: nosniff` na ovoj ruti (global Helmet vjerovatno pokriva, ali nema contract testa);
- `Content-Length`/stream backpressure.

Direktan browser Buffer download izbjegava server-side ostatak, ali prebacuje sav exfiltration rizik na endpoint/session i lokalni uređaj administratora.

## 10. Event-loop lag reporter

Monitor koristi Node `monitorEventLoopDelay`, loguje p50/p95/max svakih 10 sekundi, resetuje histogram i vraća stop funkciju. Testovi pokrivaju konverziju, format, histogram i lifecycle. `timer.unref()` je ispravan.

Slabosti:

- rezultat je tekstualni log, ne typed metric sa scrape/export ugovorom;
- nema instance/build/role labela;
- reset odmah nakon log poziva može izgubiti interval ako logger baci exception;
- callback nema try/catch; logger exception može prekinuti interval callback/process behavior;
- monitor je pokrenut u API `main.ts`, ali ne i nužno u worker procesu gdje CPU-heavy jobovi nastaju;
- resolution/interval nisu validirani (0/negativne vrijednosti helper caller može poslati);
- nema startup sample suppression niti shutdown telemetry.

Ops-health naknadno može parsirati/persistirati signal, ali izvor i sink trebaju typed metric contract i outage detection.

## 11. WebSocket client reporter

Reporter čita local Socket.IO `engine.clientsCount` i periodično loguje broj. Ako `debug` postoji koristi debug nivo; production log level može ga potpuno izostaviti. Broj je per-instance, ne cluster total. Ako engine nije dostupan u trenutku starta, helper vraća no-op i nikada ne pokušava ponovo, pa kasni transport init trajno gubi metriku.

Ne validira da je broj nenegativan integer; prihvata bilo koji finite broj. Logger exception nije izolovan. Nema signal “metric source unavailable”, pa odsustvo linije izgleda kao nula/tišina. Ops-health ima zasebne Redis websocket metrike, što stvara dva djelimično preklapajuća izvora bez jednog kanonskog ugovora.

## 12. Test dokaz

Pokrenuto svih pet direktnih suiteova:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  $(find src/modules/observability -name '*.spec.ts' -print | sort)
```

Rezultat:

- **4/5 suiteova prošla**;
- **1/5 compile-blockiran**;
- **12/12 izvršenih testova prošlo**.

Compile blokada authorization compatibility suitea: generated `PrismaService` nema `group`, `$transaction`, a callback posljedično dobija implicit `any`.

Zeleni testovi pokrivaju include flagove/fajlove, osnovni config parser, event-loop helper i WebSocket reporter. Nisu pokriveni service/controller export, secret/PII redaction, full dataset size, memory/CPU, concurrency, disconnect/cancel, audit lifecycle/failure, corrupted settings revision, ZIP hash/encryption, worker event-loop monitoring ni multi-instance metrics.

## 13. Pozitivni nalazi

1. Endpoint zahtijeva session, SuperAdmin role i dedicated permission.
2. Admin sa samom permissionom nije namjeravano dovoljan.
3. Response postavlja `Cache-Control: no-store`.
4. Greške su kodirane i ne vraćaju interni exception.
5. Support bundle se može globalno isključiti.
6. Svaki osjetljivi dio ima include flag.
7. ZIP filenames su fiksni i bez path traversal ulaza.
8. Manifest navodi actor, request, vrijeme, flagove i parts.
9. Uspješna generacija zapisuje dedicated audit action.
10. Recent log buffer ima hard entry-count cap.
11. Event-loop histogram se resetuje po intervalu i uredno zatvara.
12. WebSocket reporter ima stop funkciju i ne starta timer bez izvora.
13. Četiri suitea i svih 12 izvršenih testova su zeleni.

## 14. Registar nalaza

| ID        | Severity | Nalaz                                                                                                 | Status   |
| --------- | -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| BA-obs-01 | P1       | Globalni config/audit/log dataset se učitava, serializuje i ZIP-kompresuje u memoriji API procesa     | otvoreno |
| BA-obs-02 | P1       | Nema concurrency/rate/byte/time limita; paralelni exporti mogu izazvati memory/CPU/event-loop DoS     | otvoreno |
| BA-obs-03 | P1       | Recent logs i audit metadata izvoze se bez centralne PII/credential redakcije                         | otvoreno |
| BA-obs-04 | P1       | Default-on globalni sensitive export nema MFA/re-auth, reason, approval ni scoped/time-bounded command | otvoreno |
| BA-obs-05 | P2       | Config snapshot nema dedicated allowlist/registry secret invariant i uključuje širok poslovni sadržaj | otvoreno |
| BA-obs-06 | P2       | Audit export je cijeli chain bez scope/date/record/byte limita i integrity summaryja                  | otvoreno |
| BA-obs-07 | P2       | Export audit nastaje tek poslije generacije; failed/aborted attempt i download lifecycle nisu evidentirani | otvoreno |
| BA-obs-08 | P2       | GET pokreće skupu auditiranu operaciju i izložen je prefetch/CSRF-style resource triggeru             | otvoreno |
| BA-obs-09 | P2       | Retention/recent-minutes nemaju maksimum; audit retention je neuvezan, request retention kasno primijenjen | otvoreno |
| BA-obs-10 | P2       | Configuration read nije atomarni revision snapshot                                                    | otvoreno |
| BA-obs-11 | P2       | ZIP nema per-part hash/signature/encryption/size manifest ni managed expiry/revocation                | otvoreno |
| BA-obs-12 | P2       | Event-loop i WS “metrics” su best-effort log linije, ne pouzdan typed/exported metric ugovor          | otvoreno |
| BA-obs-13 | P2       | Event-loop monitor nije dokazano aktivan u workeru; WS reporter se trajno gasi ako engine kasni       | otvoreno |
| BA-obs-14 | P2       | Nema service/controller/load/concurrency/redaction/export-failure integration testova                | otvoreno |
| BA-obs-15 | P3       | Recent log entry nema per-message size/depth limit i buffer retention nije stvarno day-guaranteed     | otvoreno |
| BA-obs-16 | P3       | Reporter callbackovi ne izoluju logger exception i option vrijednosti nisu validirane                 | otvoreno |
| BA-obs-17 | P3       | WS client count je per-instance/debug-level i nema unavailable/cluster-total semantiku                | otvoreno |
| BA-obs-18 | P3       | 1/5 suiteova compile-blockiran zbog generated Prisma/authorization tipova                            | otvoreno |

## 15. Ključne korekcije

- **01–02:** async bounded worker export, cursor streaming, hard per-part/total byte limit, lock, timeout, cancellation i backpressure.
- **03,05–06:** structured redaction, dedicated diagnostic allowlist, registry secret invariant, scoped/time-bounded audit i integrity summary.
- **04,08:** POST command, MFA/re-auth step-up, reason/ticket, optional four-eyes i short-lived one-time download.
- **07,11:** persistent export ledger, intent/failure/ready/download/expiry audit, hashes/signature i encrypted TTL artifact.
- **09–10:** bounded atomarni config snapshot i stvarno retention enforcement.
- **12–13,16–17:** typed metrics exporter za API+worker, instance/build labels, retry source discovery i logger isolation.
- **14,18:** otključati suite i dodati controller/service/load/security integration matrice.

## 16. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   4,30 |
| B. API i ugovori             |    12% |   4,20 |
| C. Auth/authz/scope          |    15% |   5,20 |
| D. Poslovna pravila/stanje   |    13% |   3,80 |
| E. Podaci/Prisma/transakcije |    13% |   3,30 |
| F. Sigurnost/privatnost      |    12% |   3,10 |
| G. Async/integracije         |     8% |   3,40 |
| H. Testovi/dokazivost        |    10% |   3,60 |
| I. Operativnost/perf.        |     7% |   2,90 |
| **Ukupno**                   | **100%** | **4,08/10** |

Ponderisani rezultat je približno **4,09/10**, konzervativno zaključen na **4,08/10** zbog četiri P1 nalaza na globalnom sensitive exportu. Jaki role/permission guardovi i čisti helperi sprečavaju nižu ocjenu, ali ne kompenziraju nebounded API-process arhiviranje i nedostatak redakcije/step-upa.

## 17. Fazni plan

### Faza 0 — safety net

Otključati svih pet suiteova; dodati secret/PII corpus, controller auth/step-up, size/concurrency/disconnect, audit failure i reporter lifecycle testove.

### Faza 1 — export security boundary

POST intent, re-auth/MFA, reason/scope/time range, allowlist/redaction preview i persistent export ledger.

### Faza 2 — bounded async pipeline

Worker job, cursor streaming, concurrency lock, hard bytes/rows/time, cancellation, progress i memory/load gate.

### Faza 3 — artifact lifecycle

Encrypted TTL object, hashes/signature, one-time download, expiry/revocation i complete intent/download/failure audit.

### Faza 4 — metrics contract

Typed metrics za API i worker, stable labels, multi-instance aggregation, reporter error isolation i source retry.

### Faza 5 — finalni gate

Svi unit/integration/security/load testovi zeleni na finalnom SHA-u; dokazati odsustvo secreta/PII, bounded memory pod paralelnim exportom, step-up i kompletan artifact audit lifecycle.

## 18. Acceptance i presuda

1. Export se ne generiše u memoriji API procesa i ima tvrde row/byte/time/concurrency limite.
2. Nijedan secret/token/cookie/password/private key niti neodobren PII ne ulazi u bundle.
3. Config i audit sadržaj su explicit allowlisted, scoped i vremenski ograničeni.
4. Export zahtijeva recent MFA/re-auth i obavezni business reason.
5. Svaki request, failure, ready, download i expiry događaj je immutable auditiran.
6. Artifact je hashiran, po potrebi šifrovan, kratkotrajan i opoziv.
7. Retention postavke imaju stvarni bounded enforcement.
8. Event-loop i WS signali su typed, pouzdani i pokrivaju API/worker/multi-instance semantiku.
9. Logger i reporter greške ne ruše aplikaciju niti tiho gase metriku.
10. Svih pet suiteova i security/load matrica prolaze.

Modul štiti endpoint jakim osnovnim RBAC-om, ali support bundle je praktično globalni forenzički export. Takav export mora imati strožu kontrolu od običnog administratorskog downloada i ne smije se graditi neograničeno u API heapu. Iskren baseline je **4,08/10**.
