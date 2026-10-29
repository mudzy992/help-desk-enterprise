# Backend audit 43 — `change-log`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** srednji  
**Baseline ocjena:** **3,57/10**  
**Nalazi:** 5 P1, 10 P2, 5 P3

## 1. Executive summary

`change-log` je shared mutation-history utility koji koristi više od 50 produkcijskih write tokova u tickets, SLA, routing, settings, knowledge i povezanim domenama. Modul kanonizira JSON, izračunava path-level diff, upisuje `ChangeLog` red, validira razlog kroz opcionalni helper i pruža nepageinirani list helper. Nema vlastiti Nest modul/controller; authorization, transaction, redaction i API mapping ostavlja callerima.

Baseline je **3,57/10**. Determinističko sortiranje i jednostavan transactional-client shape olakšavaju reuse, a pojedini potrošači — naročito tickets — imaju dodatnu redakciju i upisuju change log u istoj Prisma transakciji. Međutim centralni dokaz promjene nije semantički pouzdan niti sigurnosno zatvoren.

Najkritičnije, diff ne razlikuje “path ne postoji” od `null`, jer missing stranu predstavlja kao `null`. Promjena missing → null ili null → missing potpuno nestaje. Prazni objekti i nizovi nemaju leaf path, pa `{}` ↔ `[]`, dodavanje/brisanje prazne strukture i dio replace operacija takođe mogu dati prazan ili netačan diff. Path format sa tačkom ne escapeuje ključeve, pa literal key `a.b` kolidira sa nested `a.b`.

`recordChangeLog()` ne poziva `requireChangeReason`, ne validira action/entity/resource korespondenciju i prihvata arbitrary JSON. `entityType/entityId` u DB redu može se razlikovati od `diff.resourceType/resourceId`; action može biti semantički pogrešan, a blank reason prolazi ako caller zaboravi helper. Centralni API zato ne garantuje vlastite deklarisane invariante.

Redakcija nije centralna. Utility trajno čuva kompletne `before`, `after` i `changes`; ticket caller ima posebnu safe-logging/redaction logiku, ali ostalih 50+ tokova zavise od ručne discipline. Nova tajna, token, certifikat, webhook URL, PII ili confidential field vrijednost automatski završava u changelogu ako caller napravi snapshot. Ne postoji registry/schema-driven denylist niti automated repository-wide “no secret value” dokaz.

Transakcijska atomarnost takođe nije dio API-ja: type dopušta i root `PrismaService` i transaction-like delegate. Neki calleri koriste transakciju, ali centralna funkcija ne može dokazati da business mutation i log imaju isti commit. Budući ili postojeći direct call može napraviti mutation bez loga ili log bez mutationa. `ChangeLog` nema hash chain, immutable DB trigger/role, sequence/correlation/request ID, retention/legal hold niti integrity verifier. Obična DB write capability može retroaktivno izmijeniti ili obrisati historiju.

Oba direktna suitea prolaze, ali to su samo 2 testa: jedan deterministic object-key diff i jedan reason helper test. Nisu testirani null/missing/empty/array/key-escaping slučajevi, recorder, Prisma schema, list, redaction, tamper, transactions, retention ili authorization. Popravke nisu implementirane.

## 2. Scope i inventar

- 10 produkcijskih TypeScript fajlova;
- 2 direktna speca;
- 276 direktno izmjerenih produkcijskih LOC (registar navodi 286);
- bez controllera i injectable servisa;
- više od 50 produkcijskih caller fajlova koriste record helper ili domain wrapper;
- 4 read call sitea koriste `listChangeLogs`;
- Prisma `ChangeLog`: entityType, entityId, reason, JSON diff, nullable actor FK i createdAt;
- indeksi samo `(entityType, entityId)` i `actorUserId`.

Ovo je posljednji pojedinačni modul. Cross-cutting audit 44 ponovo će obuhvatiti transaction discipline, Prisma DB privileges, logging/redaction i request correlation kroz cijeli backend.

## 3. Diff semantika — missing i null

`buildDeterministicDiff` flattenira obje strane u `Map<path,value>`. Za path koji ne postoji postavlja vrijednost `null`:

```text
previous = has(path) ? value : null
next     = has(path) ? value : null
```

Zbog toga su sljedeće promjene nevidljive:

- `{}` → `{field:null}`;
- `{field:null}` → `{}`;
- nested missing → null;
- null → deleted;
- array slot ili object property gdje je stvarna vrijednost null naspram odsustva.

Change log više ne može dokazati da je polje eksplicitno očišćeno ili fizički uklonjeno. Za konfiguraciju, SLA, routing i ticket form data ta razlika može biti poslovno bitna.

Potreban je eksplicitni sentinel/op model (`add/remove/replace`) umjesto overloadovanog null-a. Persisted entry treba imati `op`, `path` kao JSON Pointer i samo relevantne before/after vrijednosti.

## 4. Prazne strukture i array semantika

`flattenJsonPaths` emituje samo primitive leaf. Prazan objekt ili array ne emituje ništa. Zato:

- `{field:{}}` i `{}` mogu izgledati isto;
- `{field:[]}` i `{}` mogu izgledati isto;
- `{}` ↔ `[]` na rootu daje prazan diff;
- replace primitive → empty container prikazuje samo remove primitive, ne novu strukturu;
- create/delete praznog resource snapshot-a može imati `changes:[]`.

Arrays se flatteniraju po indeksu. Insert na početak proizvodi replace za svaki kasniji element, a reorder izgleda kao masovna izmjena. Ne postoji stable-key array strategija niti whole-array marker.

JSON Pointer/RFC 6902 ili versionirani domain diff schema treba razlikovati container existence, add/remove/replace i opcionalno keyed collection semantics.

## 5. Path kolizije

Path se spaja tačkom bez escaping-a. Objekt `{ "a.b": 1 }` i `{ a: { b: 1 } }` oba daju `a.b`. Numeric object key i array indeks takođe se ne razlikuju. Ključevi sa tačkom već su mogući u dynamic form/config JSON-u.

To može spojiti dvije različite promjene u isti path Map entry i proizvesti pogrešan audit prikaz. JSON Pointer sa `~0/~1` escapingom ili segment array je obavezan.

## 6. Centralni recorder ne provodi invariante

`recordChangeLog()` samo radi `changeLog.create`. Ne provjerava:

- reason nije blank i ≤512;
- `entityType === diff.resourceType`;
- `entityId === diff.resourceId`;
- action pripada create/update/delete;
- create ima prazan before, delete prazan after ili update stvarne changes;
- actor postoji/je dozvoljen ili je system actor eksplicitno klasifikovan;
- diff veličinu, dubinu, broj pathova i JSON runtime shape;
- redakciju;
- request/correlation/idempotency ID.

`requireChangeReason` je zaseban helper koji samo neki wrapperi pozivaju. Ticket automatski razlozi ga ne trebaju, ali centralni recorder mora barem validirati normalized nonempty reason ili imati explicit trusted system reason type. Trenutni string type ne razlikuje user input od katalogizovanog system reasona.

DB nema check constraint za reason/action/resource consistency, jer action/resource žive samo unutar JSON-a. Potrebni su typed command factory i DB-level minimalni checks.

## 7. Redaction i data minimization

Diff payload duplira podatke najmanje tri puta: kompletan `before`, kompletan `after`, zatim promijenjene before/after vrijednosti u `changes`. To povećava PII i storage exposure. Ticket wrapper rediguje confidential/sensitive tekst prema configu, što je pozitivno, ali utility nema centralni policy.

Rizici uključuju:

- settings snapshot može sadržati private/secret-like vrijednost;
- routing/SLA/config snapshot može sadržati emails, webhook/host podatke ili template text;
- ticket/form snapshots sadrže user-provided sadržaj;
- attachments/participants/time logs sadrže identifikatore;
- budući caller može proslijediti password/token/private key bez prepreke.

Potrebna je per-entity versionirana snapshot schema sa explicit allowlistom, registry secret exclusionom i redaction markerima (`[REDACTED]`, hash, changed=true). Centralni recorder treba odbiti forbidden key patterns i prevelik payload, a test treba iterirati setting registry i sensitive field catalog.

## 8. Transaction atomarnost

`ChangeLogPrismaClient` zahtijeva samo `changeLog.create`, pa funkcija ne zna je li dobila transaction client ili root service. To olakšava unit test i reuse, ali correctness ostavlja calleru. Dio domena pravilno radi mutation + log u `$transaction`; drugi helperi mogu se pozvati poslije već commitovane mutacije ili prije nje.

Enterprise invariant mora biti: za state-changing operaciju koja zahtijeva change log, mutation i log commitaju zajedno ili koriste durable outbox/event sourcing. API može prihvatiti samo branded transaction context, a root convenience wrapper treba sam otvoriti transaction i izvršiti mutation callback.

Potrebna je repository-wide traceability matrica entity/action → mutation function → transaction test. Sam broj call siteova ne dokazuje coverage; mutation koja nikada ne pozove helper ostaje nevidljiva.

## 9. Tamper evidence i append-only zaštita

Za razliku od `AuditLog`, `ChangeLog` nema hash chain, previous hash, checkpoint, verifier niti append-only DB role/trigger. Prisma schema ne sprečava update/delete. Aplikacija trenutno možda nema javni update/delete API za changelog, ali kompromitovan app credential ili bug može retroaktivno promijeniti historiju.

Nema monotonog sequence broja; `createdAt` može biti jednak za više redova, pa total ordering nije determinističan. Nema requestId, transactionId, causationId ili config version koji povezuje više redova jedne operacije.

Ako change log služi samo UX historiji, dokumentacija mora to jasno reći i security/compliance dokaz ostaviti AuditLogu. Ako služi dokazivosti konfiguracijskih promjena, treba append-only privilege separation, tamper-evident chain/checkpoints i verification job.

## 10. Actor lifecycle

`actorUserId` je nullable i FK koristi `onDelete:SetNull`. Nakon hard deletea usera changelog gubi stabilni actor ID; ostaje samo null. `listChangeLogs` prikazuje aktuelni displayName, ne display name u trenutku promjene. Rename korisnika retroaktivno mijenja prikaz historije.

System actor i “actor deleted” nisu razlikovani. Potrebni su immutable actor snapshot (`actorType`, stable subject ID/pseudonym, display label at event time) i privacy-aware pseudonymization koja ne uništava accountability. Actor deletion policy mora biti usklađena s retention/legal basisom.

## 11. Read API helper

`listChangeLogs` filtrira entityType i opcionalni entityId, ali nema:

- cursor/pagination;
- `take`/hard limit;
- date range;
- OU/service scope;
- authorization;
- redaction po vieweru;
- schema validation/migration;
- deterministic tie-break (`createdAt desc, id desc`).

Caller mora sve to osigurati. Postoje routing, SLA i ticket-history read putanje. Za entity type sa dugom historijom helper učitava sve redove, actor join i puni JSON diff u memoriju/response. To je availability i data-exposure rizik.

Helper castuje DB JSON u `ChangeLogDiffPayload` bez runtime validacije. Legacy/corrupt row može srušiti frontend ugovor ili unijeti neočekivane strukture. Potreban je versioned parser i safe legacy fallback.

## 12. Retention i storage growth

Schema nema retention timestamp/policy, partitioning, payload size limit ili archive marker. `before`+`after` snapshotovi mogu biti veliki; svaki ticket update može ponovo spremiti cijeli description/formData i arraye. Indeks `(entityType,entityId)` podržava entity history, ali ne retention scan po createdAt jer nema createdAt indeks.

Nema metrics za row count, bytes/day, largest diff, write failure ili redaction count. Nema purge/legal hold/export lifecyclea. Privacy retention treba biti per entity class; config history i ticket PII ne moraju imati isti rok.

## 13. Determinizam i runtime JSON

Object keys se sortiraju i diff paths se sortiraju, što daje stabilan output za obični JSON. Ali TypeScript `JsonValue` nije runtime zaštita. `NaN`, Infinity, Date, undefined, BigInt, cyclic object ili ekstremno dubok input mogu dati transformaciju, exception ili stack overflow. `toPersistedDiff` radi JSON stringify/parse tek poslije diff izračuna; canonicalizer može već rekurzivno pasti.

`localeCompare` može imati ICU/locale varijacije između runtime buildova za Unicode ključeve. Za canonical security representation treba byte/codepoint deterministic comparator i canonical JSON standard.

Maksimalna dubina, broj nodeova, string length i serialized bytes moraju biti ograničeni prije canonicalizationa.

## 14. Test dokaz

Pokrenuta oba direktna suitea:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  src/modules/change-log/build-deterministic-diff.spec.ts \
  src/modules/change-log/require-change-reason.spec.ts
```

Rezultat: **2/2 suitea prošla; 2/2 testa prošla**.

Dokazano je samo:

- key-order independent diff za obični nested object;
- sorted paths;
- reason missing/blank/>512 reject i trim u helperu.

Nisu dokazani: missing/null, empty object/array, array insert/reorder, dotted/numeric keys, create/delete semantics, recorder reason enforcement, mismatch invariants, redaction, transaction rollback, Prisma persistence/list, pagination/auth, actor deletion, tamper verification, retention, oversized/deep/cyclic/non-JSON input i cross-module mutation coverage.

## 15. Pozitivni nalazi

1. Object keys i output paths imaju determinističko sortiranje za osnovni JSON.
2. Before/after se canonicalizuju prije diffa.
3. Reason helper trimuje i ograničava na 512 znakova.
4. Recorder prima minimalni transaction-compatible client shape.
5. Prisma ima entity history i actor indekse.
6. Actor FK sprečava dangling active user reference.
7. Ticket wrapper ima specifičnu confidential/sensitive redakciju.
8. Više važnih caller tokova upisuje log unutar business transakcije.
9. Oba direktna suitea su zelena.

## 16. Registar nalaza

| ID          | Severity | Nalaz                                                                                              | Status   |
| ----------- | -------- | -------------------------------------------------------------------------------------------------- | -------- |
| BA-clog-01  | P1       | Missing path se predstavlja kao null; add/remove null promjene potpuno nestaju                     | otvoreno |
| BA-clog-02  | P1       | Prazni objekti/nizovi nemaju path; create/delete/replace može imati netačan ili prazan diff         | otvoreno |
| BA-clog-03  | P1       | Recorder ne provodi reason/action/entity/resource invariants i dopušta međusobno kontradiktoran red | otvoreno |
| BA-clog-04  | P1       | Nema centralne redakcije/allowliste; before/after/changes mogu trajno duplicirati secret/PII        | otvoreno |
| BA-clog-05  | P1       | Transaction atomarnost nije dio API ugovora; mutation i log mogu commitati odvojeno                | otvoreno |
| BA-clog-06  | P2       | Dot path bez escaping-a kolidira sa literal dotted keyem i array/numeric segmentima                | otvoreno |
| BA-clog-07  | P2       | Array indeks diff pretvara insert/reorder u netačnu/noisy seriju replace promjena                  | otvoreno |
| BA-clog-08  | P2       | Nema append-only DB zaštite, hash chain/checkpoint ni integrity verifier                           | otvoreno |
| BA-clog-09  | P2       | Actor SetNull i live displayName gube/stvaraju retroaktivnu attribution semantiku                  | otvoreno |
| BA-clog-10  | P2       | List helper nema pagination/limit/date/scope/authorization i može učitati cijelu historiju         | otvoreno |
| BA-clog-11  | P2       | Persisted JSON se castuje bez version/schema validacije                                            | otvoreno |
| BA-clog-12  | P2       | Nema retention/legal-hold/partitioning/createdAt index ni storage-growth budžeta                   | otvoreno |
| BA-clog-13  | P2       | Before+after+changes višestruko dupliraju velike/confidential vrijednosti                          | otvoreno |
| BA-clog-14  | P2       | Nema request/transaction/causation/idempotency ID-a ni total order sequence                       | otvoreno |
| BA-clog-15  | P2       | Nema repository-wide entity/action → mutation coverage dokaza                                     | otvoreno |
| BA-clog-16  | P3       | Runtime ne ograničava JSON tip, dubinu, node count, string/serialized bytes ili cikluse            | otvoreno |
| BA-clog-17  | P3       | Unicode `localeCompare` nije eksplicitni canonical byte/codepoint comparator                       | otvoreno |
| BA-clog-18  | P3       | Unknown/system/deleted actor nisu eksplicitno različiti                                           | otvoreno |
| BA-clog-19  | P3       | Read ordering nema ID tie-break za jednake createdAt vrijednosti                                  | otvoreno |
| BA-clog-20  | P3       | Samo 2 testa; recorder/list/schema/redaction/transaction/tamper tokovi nisu direktno testirani     | otvoreno |

## 17. Ključne korekcije

- **01–02,06–07:** RFC 6902/JSON Pointer op model sa explicit add/remove/replace i container markerima.
- **03:** centralni typed recorder/factory, normalized required reason i DB checkovi za redundantne kolone.
- **04,13:** per-entity allowlisted snapshot schema, secret registry/redaction i payload minimization.
- **05,15:** branded transaction API i automatska mutation coverage matrica/contract test.
- **08,14:** append-only DB role/trigger, sequence, request/transaction IDs i tamper-evident chain ako je compliance dokaz.
- **09,18:** immutable privacy-aware actor snapshot i explicit SYSTEM/USER/DELETED tip.
- **10–12,19:** cursor/date/scope/auth read contract, versioned parser, retention/legal hold, createdAt+id indeks.
- **16–17,20:** canonical JSON standard, hard complexity limiti i proširena security/integration test matrica.

## 18. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   4,20 |
| B. API i ugovori             |    12% |   3,80 |
| C. Auth/authz/scope          |    15% |   3,90 |
| D. Poslovna pravila/stanje   |    13% |   3,10 |
| E. Podaci/Prisma/transakcije |    13% |   3,20 |
| F. Sigurnost/privatnost      |    12% |   3,00 |
| G. Async/integracije         |     8% |   4,30 |
| H. Testovi/dokazivost        |    10% |   2,70 |
| I. Operativnost/perf.        |     7% |   3,20 |
| **Ukupno**                   | **100%** | **3,57/10** |

Ponderisani rezultat i konačni baseline su **3,57/10**. Mali utility scope i dobre caller-level transakcije/redakcije ne uklanjaju pet P1 centralnih invarianta.

## 19. Fazni plan

### Faza 0 — safety net

Missing/null/empty/array/path corpus, recorder mismatch, redaction, transaction rollback, Prisma list/pagination, actor lifecycle, tamper i oversized/deep input testovi.

### Faza 1 — versionirani diff ugovor

JSON Pointer + add/remove/replace, container semantics, version field, strict runtime parser i canonical complexity limits.

### Faza 2 — transaction i recorder invarianti

Branded transaction command, required reason/action/entity checks, request/causation IDs i DB constraints.

### Faza 3 — privacy i actor model

Per-entity snapshot allowlist, secret/PII redaction, payload minimization i immutable actor snapshot.

### Faza 4 — read, integrity i retention

Authorized cursor API, date/scope filters, deterministic order, append-only/tamper verification, retention/legal hold i storage metrics.

### Faza 5 — finalni gate

Repository-wide mutation coverage matrica i svi unit/integration/security/privacy testovi zeleni na finalnom SHA-u.

## 20. Acceptance i presuda

1. Missing, null, empty object/array i delete/add imaju različit i tačan diff.
2. Path format nema kolizije za dotted/numeric/array segmente.
3. Recorder odbija blank reason, unknown action i entity/resource mismatch.
4. Secret/PII polja ne mogu ući bez explicit allowlist/redaction politike.
5. Business mutation i change-log row commitaju atomski.
6. Actor attribution preživljava rename/delete uz privacy policy.
7. History read je authorized, scope-aware, paginiran i version-validated.
8. Change log je jasno UX history ili ima stvarnu tamper-evident compliance zaštitu.
9. Retention/legal hold i storage budget su izvršni.
10. Mutation coverage i proširena test matrica prolaze.

Modul je široko korišten, ali centralni diff trenutno ne razlikuje nekoliko osnovnih JSON promjena, a correctness/redaction/transaction discipline prebacuje na desetine callera. Za history subsystem to je prenizak nivo centralnih garancija. Iskren baseline je **3,57/10**.
