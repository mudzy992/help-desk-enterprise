# Backend audit 11 — `privacy`

**Status:** audit završen  
**Datum:** 2026-10-22  
**Rizik modula:** kritičan  
**Baseline ocjena:** **5,57/10**  
**Nalazi:** 4 P1, 7 P2, 2 P3

## 1. Executive summary

Privacy modul je funkcionalno širok i iznadprosječno promišljen: pokriva evidenciju zahtjeva nosilaca podataka, rokove, pravne zabrane brisanja, retention, šifrovane izvoze, four-eyes anonimizaciju, tombstone detekciju, javno obavještenje i evidenciju aktivnosti obrade. Destruktivne HTTP rute imaju session/permission zaštitu, anonimizacija je SuperAdmin-only, export download je requester-only i traži svježu potvrdu identiteta, a brojni DB writeovi su povezani sa audit zapisom u istoj transakciji.

Baseline je ipak **5,57/10**. Četiri P1 problema direktno pogađaju pravnu i sigurnosnu pouzdanost: legal hold se može postaviti/ukloniti sa read permisijom; anonimizacija mijenja i briše desetine skupova podataka prije završne transakcije pa kvar ostavlja trajno parcijalno stanje; Redis retention lock ističe nakon 30 minuta i nema owner token/renewal iako posao smije trajati do 240 minuta; audit redaction mijenja hashirani sadržaj red po red izvan jedne atomske chain transakcije i može pokvariti forenzički dokaz.

Nema P0: nije pronađena javna destruktivna ruta, cross-user export download bypass niti direktno izlaganje encryption ključa. Popravke se ne implementiraju prije završetka svih modula i konsolidovanog plana.

## 2. Scope i inventar

- 44 produkcijska TypeScript fajla;
- 16 direktnih specova;
- 3 kontrolera, 11 servisa;
- 6.591 aktuelna fizička LOC (snapshot inventara: 6.635);
- API, worker, BullMQ, Redis, Prisma, filesystem/object storage, mail, settings, audit-log, authentication i authorization granice;
- E2E 20 (`privacy`) i 43 (`privacy notice editor`), uz accessibility/closeout reference.

Tokovi: data-subject request register i reminderi; export request/build/encryption/download/expiry; anonimizacija request/approval/execution/ledger/tombstone; retention dry-run/gate/batch; legal hold; privacy notice i processing record; queue maintenance i recovery.

## 3. Arhitektura i lifecycle tokovi

### 3.1. Data-subject requests

`privacy.manage` kreira, mijenja, produžava i zatvara zahtjev; `privacy.view` čita. Rok je 30 dana, produženje jednom za 60 dana prije originalnog roka. Mutacije koriste optimistic status uslov i audit u istoj transakciji. Reminder claim je atomic, dedupe key je stabilan, a poruka ne nosi subject label.

Listanje je ograničeno na 200 bez cursor paginacije. Retention može obrisati zatvoreni register prema konfiguraciji, ali nema pravnog holda specifičnog za request niti provjere da je povezani rezultat/rejection evidence sačuvan.

### 3.2. Legal hold i retention

Legal hold čuva razlog i auditira set/clear transakcijski. Ticket hold i held requester izuzimaju relevantne tikete iz retentiona; user hold blokira anonimizaciju. Međutim write rute koriste `privacy.view`, ne `privacy.manage`, uz ADMIN/SUPER_ADMIN role filter.

Retention koristi dry-run gate za attachments, ticket content i audit. Kategorije se izvršavaju u batch-evima i run bilježi count/range/ref. Redis lock ima TTL `staleJobMs=30 min`, nema token ni renewal; konfigurirani noćni budget ide do 240 min. Stari owner u `finally` radi obični `DEL`, pa može obrisati lock novog ownera.

Attachment retention prvo briše blob pa DB red; DB kvar ostavlja orphan/missing-file nesklad. Ticket-content redaction je u DB transakciji. Audit retention koristi chain advisory lock i checkpoint, ali nasljeđuje nalaze modula 08 o anchoru i canonical envelopeu.

### 3.3. Privacy export

Request i audit nastaju transakcijski, a queue enqueue je poslije transakcije; 15-min maintenance oporavlja QUEUED starije od pet minuta. Worker gradi ZIP, streama ga kroz segmentirani AES-256-GCM cipher u `.part`, atomskim renameom objavljuje `.hdx`, a expiry briše fajl.

Download je requester-only, READY/unexpired i zahtijeva passkey/TOTP ili 15-min fresh-session fallback. Brojač i audit se zapisuju prije otvaranja/uspješne isporuke decryption streama. Builder učitava brojne kompletne kolekcije i sabira audit rows u memorijski niz; attachment bytes jesu ograničeni, ukupni JSON/ZIP record count/bytes nisu.

### 3.4. Anonimizacija

SuperAdmin + `privacy.anonymize`, potvrda e-maila, identity confirmation, blocker provjera i opcioni drugi SuperAdmin. Request/audit su transakcijski, worker claim je conditional, maintenance oporavlja orphan/stale jobs.

Executor ipak radi veliki niz pojedinačnih delete/update operacija, filesystem brisanja i scrubova prije `finalizeUser` transakcije. Kvar označava erasure `FAILED`, ali već izvršene promjene se ne vraćaju. Retry nije dokazano idempotentan za svaku vanjsku i DB operaciju. Audit metadata redaction se takođe radi red po red, bez chain locka i atomic manifesta.

Tombstones su HMAC-ovani i podržavaju current/previous/legacy key. Vanjski JSONL erasure ledger je `0600`, ali nije HMAC potpisan, fsync/locking/atomic manifest nije dokaziv i append failure se samo loguje nakon DB commit-a.

### 3.5. Notice i processing record

Public notice je namjerno bez autentikacije i vraća samo konfiguracijski/pravno-generisan sadržaj. Admin editor traži `privacy.manage`, oba jezika zapisuje settings batchom. Draft jasno nosi upozorenje da nije pravno odobren. Processing record sintetizira konfiguraciju i agregatne countove, ali pojedine tvrdnje o TLS, backupu/DR, antivirusu i ponovnoj primjeni anonimizacija su statički tekst, a ne provjeren capability/health dokaz.

## 4. API/guard/scope matrica

| Površina                   | Zaštita                             | Scope/step-up                      | Zaključak                   |
| -------------------------- | ----------------------------------- | ---------------------------------- | --------------------------- |
| request list/detail        | session + `privacy.view`            | globalni privacy registar          | bounded bez paginacije      |
| request write/close/extend | session + `privacy.manage`          | globalno                           | audit transakcijski         |
| retention read             | session + `privacy.view`            | globalno                           | no-store                    |
| retention queue            | session + `privacy.manage`          | globalno                           | worker gate                 |
| legal hold set/clear       | session + ADMIN/SA + `privacy.view` | ticket/user globalno               | pogrešna read permisija     |
| anonymization read/write   | session + SA + `privacy.anonymize`  | globalno; write identity-confirmed | four-eyes opcionalan        |
| export create/list/detail  | session + `privacy.manage`          | globalni metadata view             | download requester-only     |
| export download            | session + `privacy.manage`          | requester + step-up                | fresh-session fallback      |
| processing record          | session + `privacy.view`            | globalni agregat                   | no-store                    |
| public notice              | javno                               | locale BS/EN                       | namjerno javno, cache 5 min |
| notice editor              | session + `privacy.manage`          | globalno                           | settings audit              |

Horizontalni download bypass nije pronađen. Globalni pregled privacy managera je funkcionalna DPO/admin politika, ali nema OU scope. Najveća vertikalna rupa je legal-hold write sa `privacy.view`.

## 5. Podaci, transakcije i async analiza

- DSAR mutacije i većina administrativnih audita koriste istu Prisma transakciju.
- Export/erasure DB request i BullMQ enqueue nisu outbox transakcija; periodic maintenance daje eventualni recovery, ne odmah potvrđenu isporuku.
- Privacy queue uglavnom koristi `attempts: 1`; domain maintenance preuzima QUEUED/RUNNING nakon 5/30 min.
- Retention distributed lock nije lease-safe niti dovoljno dug za maksimalan budget.
- Anonimizacija nije saga sa per-step checkpointima/compensationom; `FAILED` ne znači „ništa nije promijenjeno“.
- External file delete/write i DB state ne mogu biti jedna ACID transakcija, ali nema durable manifest/reconciliation za sve tokove.
- Export expiry prvo pokušava unlink i ignoriše grešku, zatim označava EXPIRED; neobrisan šifrovan fajl može ostati na disku neograničeno.
- Erasure ledger nije kriptografski autentičan niti transakcijski vezan za completion.

## 6. Sigurnost, privatnost i pravna ispravnost

Pozitivno: encrypted-at-rest export, file mode 0600, path ID allowlist, CSV formula neutralizacija, requester-only download, no-store admin response, four-eyes opcija, SuperAdmin/self/last-admin/open-ticket/export/legal-hold blockeri i redacted notification sadržaj.

Rizici: fresh-session fallback se primjenjuje na svaki račun bez lokalnog MFA, iako komentar pretpostavlja SSO; nema dokaza o upstream IdP MFA claimu. Export može uključiti interne bilješke drugih lica na osnovu admin razloga bez formalnog review/approval workflowa. Audit metadata se izvozi u DSAR paket bez action-level privacy schema. Public notice 5-min cache može kratko posluživati povučeni/neispravni tekst. Processing record tvrdi operativne kontrole koje runtime ne attestira.

## 7. Testovi i izvršeni gateovi

Pokrenuto:

```bash
cd backend
npx jest --runInBand --runTestsByPath $(find src/modules/privacy -name '*.spec.ts' -print | sort)
```

Rezultat: **5/16 suiteova prošlo, 11 compile-blocked; 31/31 izvršenih testova prošlo**. Blokada je nedostajući `src/generated/prisma/client`, zbog čega Prisma modeli/delegati i tri integration suitea ne mogu compileati. Ovo je environment-blocked, nije pass za blokirane suiteove.

Postojeći specovi pokrivaju rokove, blockers, text scrubber, encryption corruption/wrong key, identity branches, legal hold, request lifecycle, retention gate, mail, notice i processing-record pure logiku. E2E 20 pokriva request/export/download/hold/retention/public notice/authorization; E2E 43 editor/fallback/publish.

Nedostaju stvarni fault/race dokazi: mid-erasure crash na svakoj fazi, retention lease expiry, queue outage/outbox, blob-vs-DB failure, download stream failure, stale IdP/non-MFA session, ledger tamper/torn concurrent append, export memory/load i legal-hold permission negative matrix.

## 8. Pozitivni nalazi

1. Destruktivne anonimizacijske rute su SuperAdmin + dedicated permission.
2. Four-eyes pravilo sprječava self-approval kada je uključeno.
3. Blockeri pokrivaju aktivan/directory/SuperAdmin/last-admin/self/hold/open-ticket/export/race stanje.
4. Export je segmentirano AEAD šifrovan, sa key rotation readerom i file permissionima.
5. Download je requester-only i identity-confirmed.
6. DSAR deadline/extension pravila su centralizovana i testirana.
7. Reminder claim/dedupe je concurrency-safe i payload je privacy-minimalan.
8. Retention destructive business kategorije imaju dry-run gate.
9. Ticket-content retention grupiše povezane DB redakcije u transakciju.
10. Audit retention koristi chain lock i checkpoint.
11. Tombstone lookup je keyed HMAC sa rotation compatibilityjem.
12. Notice draft jasno označava pravno neodobren status.
13. CSV export neutralizuje spreadsheet formule i attachment nazive.

## 9. Registar nalaza

| ID            | Severity | Nalaz                                                     | Status   |
| ------------- | -------- | --------------------------------------------------------- | -------- |
| BA-privacy-01 | P1       | Legal hold write koristi `privacy.view`                   | otvoreno |
| BA-privacy-02 | P1       | Anonimizacija je trajno parcijalna pri mid-flight kvaru   | otvoreno |
| BA-privacy-03 | P1       | Retention Redis lock može isteći i obrisati tuđi lease    | otvoreno |
| BA-privacy-04 | P1       | Audit redaction nije atomska niti chain-safe              | otvoreno |
| BA-privacy-05 | P2       | Blob/filesystem i DB lifecycle nisu durable koordinirani  | otvoreno |
| BA-privacy-06 | P2       | Export download se auditira prije uspješne isporuke       | otvoreno |
| BA-privacy-07 | P2       | Fresh-session fallback ne dokazuje SSO MFA                | otvoreno |
| BA-privacy-08 | P2       | Export build nema ukupni row/byte/memory budget           | otvoreno |
| BA-privacy-09 | P2       | Queue write nema transactional outbox                     | otvoreno |
| BA-privacy-10 | P2       | Erasure ledger nije autentičan ni crash/concurrency-safe  | otvoreno |
| BA-privacy-11 | P2       | Registar/listing površine nemaju potpunu paginaciju       | otvoreno |
| BA-privacy-12 | P3       | Processing record sadrži neattestirane sigurnosne tvrdnje | otvoreno |
| BA-privacy-13 | P3       | Public notice cache nema eksplicitnu invalidaciju/version | otvoreno |

## 10. Detaljni nalazi

### BA-privacy-01 — Legal hold write koristi `privacy.view`

**Dokaz:** `PUT/DELETE /privacy/legal-holds/:target/:id` imaju ADMIN/SA i `privacy.view`, ne `privacy.manage`.  
**Uticaj:** read-only privacy administrator može blokirati ili ponovo omogućiti zakonsko brisanje. Clear hold je posebno osjetljiv privilege escalation.  
**Korekcija:** dedicated `privacy.legalHoldManage` ili najmanje `privacy.manage`, step-up za clear i permission migration.  
**Acceptance:** korisnik sa samo view dobija 403 i servis nije pozvan; manage matrix prolazi.  
**Owner/veličina:** privacy + authorization, S/M.

### BA-privacy-02 — Anonimizacija je trajno parcijalna pri mid-flight kvaru

**Dokaz:** `AnonymizationExecutor.execute` radi mnoge delete/update/storage operacije prije `finalizeUser`; catch zatim označava `FAILED`.  
**Uticaj:** subjekt može ostati nominalno neanonimiziran, ali sa obrisanim sesijama, membershipima, notificationima ili scrubovanim poslovnim sadržajem; retry/izvještaj ne dokazuju potpunost.  
**Korekcija:** durable per-step saga/manifest, idempotentni executori, preflight snapshot, resumable checkpoints i reconciliation; jasno terminalno `PARTIAL`.  
**Acceptance:** crash poslije svake faze nastavlja do istog kompletnog rezultata bez dodatnog gubitka.  
**Owner/veličina:** privacy + vlasnici svih domena, XL.

### BA-privacy-03 — Retention Redis lock može isteći i obrisati tuđi lease

**Dokaz:** TTL je 30 min, max run 240 min; nema renewala/tokena, `finally DEL` nije compare-and-delete.  
**Uticaj:** drugi worker može paralelno pokrenuti destruktivni retention, a stari zatim obrisati novi lock. Count/ref/audit i external file operacije postaju nedeterministični.  
**Korekcija:** tokenized renewable lease ili DB advisory lock, heartbeat/fencing token i owner-only release; TTL > bounded job uz renewal.  
**Acceptance:** posao duži od 30 min ostaje ekskluzivan; stale owner ne može obrisati novi lease.  
**Owner/veličina:** privacy/platform, M.

### BA-privacy-04 — Audit redaction nije atomska niti chain-safe

**Dokaz:** `redactAuditForSubject` updateuje red po red bez chain locka, a tek na kraju zasebno appenduje manifest; canonical hash se ne preračunava/anchoruje.  
**Uticaj:** crash ostavlja djelimičnu redakciju bez manifesta; verify semantika slabi ili puca, konkurentni append/retention komplikuju dokaz.  
**Korekcija:** immutable encrypted/redaction overlay ili chain epoch pod lockom, durable batch manifest i external anchor; nikad in-place hashirani sadržaj bez formalnog protokola.  
**Acceptance:** crash/race/verify test dokazuje authorization, kompletnost i chain authenticity.  
**Owner/veličina:** privacy + audit-log, L/XL; BA-audit-log-01/04.

### BA-privacy-05 — Blob/filesystem i DB lifecycle nisu durable koordinirani

Attachment retention briše blob prije DB reda; export expiry ignoriše unlink failure i označava EXPIRED; erasure radi slične cross-store side effecte. Potreban je deletion manifest/outbox, retry/quarantine i reconciliation. Acceptance: svaki DB/storage failure konvergira, bez javno dostupnog orphana ili lažnog „obrisano“. **P2, L, privacy/storage.**

### BA-privacy-06 — Export download se auditira prije uspješne isporuke

`openDownload` incrementira count/audit prije createReadStream/decrypt i prije klijentske isporuke. Corrupt/missing/aborted stream izgleda kao uspješan download. Uvesti attempt + completed semantics ili signed delivery token/stream completion signal; testirati corrupt/abort. **P2, M, privacy/API.**

### BA-privacy-07 — Fresh-session fallback ne dokazuje SSO MFA

`PrivacyIdentityConfirmer` svaku sesiju korisnika bez lokalnog TOTP-a prihvata do 15 min, bez auth method/acr/amr claim provjere; to uključuje lokalni no-MFA račun. Vezati fallback isključivo za verificirani federated MFA assurance i zahtijevati faktor za local account. **P2, M, privacy/authentication.**

### BA-privacy-08 — Export build nema ukupni row/byte/memory budget

Builder učitava više kompletnih kolekcija, audit akumulira u array, a ZIP JSON se često gradi kao string; samo attachment bytes imaju cap. Uvesti snapshot/stream paginaciju, ukupni byte/row/time budget i manifest truncation. Load test velikog subjekta mora ostati u memory/SLO granici. **P2, L, privacy/data.**

### BA-privacy-09 — Queue write nema transactional outbox

Export/erasure request commit prethodi `queue.add`; retention request je samo queue. Maintenance oporavlja dio orphan poslova tek kasnije, ali nema durable intent za sve manual retention zahtjeve. Uvesti outbox/idempotency i operator-visible pending status. **P2, M/L, privacy/platform.**

### BA-privacy-10 — Erasure ledger nije autentičan ni crash/concurrency-safe

JSONL koristi `appendFile` bez HMAC/signature hash chaina, locka/fsync dokaza; append failure poslije DB completiona se samo loguje. Potpisani versioned ledger/outbox, atomic append/fsync, integrity verify i reconciliation su potrebni prije DR tvrdnje. **P2, M/L, privacy/DR.**

### BA-privacy-11 — Registar/listing površine nemaju potpunu paginaciju

Requests, exports, erasures, candidates, runs i holds koriste fiksni `take` ili bounded list bez cursora; stariji predmeti mogu postati nedostupni kroz API. Dodati cursor/filter/sort ugovor i total/backlog signal. **P2, M, privacy/API.**

### BA-privacy-12 — Processing record sadrži neattestirane sigurnosne tvrdnje

Generisani zapis tvrdi HTTPS/TLS, antivirus, backup/DR i replay anonimizacije iz statičkog teksta, ne health/config dokaza. Razdvojiti deklarisane i verificirane kontrole, dodati provenance/last-verified i upozorenja. **P3, M, privacy/compliance.**

### BA-privacy-13 — Public notice cache nema eksplicitnu invalidaciju/version

`Cache-Control: public,max-age=300` može pet minuta posluživati povučen tekst; response nema ETag/version/publishedAt. Dodati version/ETag i invalidaciju ili kraći/revalidation policy. **P3, S, privacy/API.**

## 11. Baseline score

| Presjek                      |   Težina |      Ocjena |
| ---------------------------- | -------: | ----------: |
| A. Arhitektura i granice     |      10% |        7,80 |
| B. API i ugovori             |      12% |        6,40 |
| C. Auth/authz/scope          |      15% |        5,30 |
| D. Poslovna pravila/stanje   |      13% |        5,20 |
| E. Podaci/Prisma/transakcije |      13% |        4,20 |
| F. Sigurnost/privatnost      |      12% |        5,50 |
| G. Async/integracije         |       8% |        4,80 |
| H. Testovi/dokazivost        |      10% |        5,50 |
| I. Operativnost/perf.        |       7% |        5,80 |
| **Ukupno**                   | **100%** | **5,57/10** |

## 12. Fazni plan popravki

### Faza 0 — safety net

Permission negative test; erasure step-by-step fault injection; >30-min retention lease race; audit-redaction crash/verify; storage/DB divergence; stream abort; queue outage; large export i ledger tamper testovi. Generated Prisma + PostgreSQL/Redis/storage fixture je obavezan.

### Faza 1 — P1 sigurnost i integritet

Ispraviti legal-hold permission i step-up; tokenized renewable retention lease; redizajnirati anonymization kao durable resumable saga; zamijeniti audit in-place redaction chain-safe protokolom. Rollback ne smije ponovo dozvoliti view-write niti silent partial.

### Faza 2 — identity i API ugovori

Assurance-aware SSO fallback; export attempt/completion audit; cursor paginacija; internal-notes approval policy; public notice version/ETag.

### Faza 3 — podaci i transakcije

Outbox + operation manifests, storage deletion state, signed erasure ledger, BIG/stream-safe export snapshot i reconciliation schema. Additive/dual-write migracije prije cutovera.

### Faza 4 — async i integracije

Idempotent worker checkpoints, retry/backoff/DLQ, owner-fenced leases, queue reconciliation, storage quarantine i DR replay rehearsal.

### Faza 5 — testovi/observability/performance

Per-step operation metrics, partial/backlog/lease/storage alarms; multi-worker race; million-row/export load; key rotation/corrupt file; legal hold propagation; restore rehearsal.

### Faza 6 — dokumentacija/finalni gate

Uskladiti pravne tekstove sa verificiranim kontrolama; runbook za DSAR, hold, retention, partial erasure, export incident i DR. Pokrenuti svih 16 suiteova, E2E 20/43 i nove integration gateove na finalnom SHA-u.

## 13. Rizik, rollback i acceptance

Najveći rizik je migracija već parcijalnih erasure stanja i chain-redaction modela. Prvo napraviti read-only classifier/reconciliation, nikad automatski ponavljati destruktivne korake bez idempotency dokaza. Outbox/manifest uvoditi additive i dual-write. Existing HTTP ugovor može zadržati 202 uz operation ID.

Globalni acceptance:

1. Read-only privacy korisnik ne može mijenjati legal hold.
2. Crash u bilo kojoj erasure fazi deterministički nastavlja ili ostaje vidljivo/oporavljivo partial, bez skrivene štete.
3. Samo jedan retention owner briše podatke; lease se obnavlja i owner-only oslobađa.
4. Audit redaction je autorizovana, crash-safe i kriptografski dokaziva.
5. DB/storage/queue kvarovi konvergiraju kroz durable manifest/outbox.
6. Download attempt se razlikuje od uspješne isporuke.
7. Fresh-session fallback zahtijeva dokazani federated MFA assurance.
8. Export ima snapshot i ukupni resource budget.
9. Ledger tamper/torn write se detektuje i DB→ledger reconciliation radi.
10. Sve liste su paginirane i svi ciljani testovi zeleni.

## 14. Traceability

| Nalaz         | Primarni dokaz                    | Faza    |
| ------------- | --------------------------------- | ------- |
| BA-privacy-01 | legal-hold controller decorators  | 0–1     |
| BA-privacy-02 | executor + finalize boundary      | 0–1/3/4 |
| BA-privacy-03 | retention Redis SET/DEL           | 0–1/4   |
| BA-privacy-04 | `audit-redaction.ts`              | 0–1/3   |
| BA-privacy-05 | retention/export/storage calls    | 0–3/4   |
| BA-privacy-06 | `openDownload`                    | 0–2     |
| BA-privacy-07 | identity confirmer fresh session  | 0–2     |
| BA-privacy-08 | export builder/service            | 0–3/5   |
| BA-privacy-09 | request→queue boundaries          | 0–3/4   |
| BA-privacy-10 | `erasure-ledger.ts`               | 0–3/4   |
| BA-privacy-11 | list methods/fixed limits         | 0–2     |
| BA-privacy-12 | processing-record static measures | 0–6     |
| BA-privacy-13 | public notice cache header        | 0–2     |

## 15. Konačna presuda i pretpostavke

Privacy modul ima snažnu funkcionalnu osnovu, ali enterprise privacy operacije moraju biti dokazivo kompletne, autorizovane i oporavljive. Trenutni partial-erasure, lease, legal-hold i audit-redaction rizici opravdavaju **5,57/10**.

Pretpostavke: upstream audit/auth/settings nalazi ostaju otvoreni; korisnikov potvrđeni Playwright 01–56 prolaz potvrđuje postojeće E2E scenarije, ne novu fault/race matricu; pravna interpretacija zahtijeva DPO/counsel odobrenje; detalji ticket/storage domena biće ponovo provjereni u njihovim modulima.
