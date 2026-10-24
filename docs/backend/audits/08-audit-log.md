# Backend audit 08 — audit-log

**Status:** audit završen  
**Datum:** 2026-10-22  
**Modul:** `backend/src/modules/audit-log`  
**Baseline ocjena:** **6,38/10**  
**Nalazi:** 3 P1, 6 P2, 2 P3, 10 pozitivnih zapažanja  
**Implementacija:** nije započeta; korekcije čekaju završetak kompletnog backend audita

## 1. Executive summary

`audit-log` je široko korišten forenzički sloj: više od 60 produkcijskih tokova poziva `appendAuditLog` ili specijalizovani wrapper. Modul ima dobru osnovu: zapis se često stavlja u istu transakciju sa domenskom mutacijom, globalni PostgreSQL advisory lock serijalizuje chain append, v2 hash veže canonical metadata digest, export je OU-scoped i auditira se, liste imaju cursor/take granice, a retention checkpoint i privacy redaction imaju eksplicitnu chain semantiku. Secret redakcija ostaje odgovornost proizvođača, ali export pravilno canonicalizuje JSON i CSV quoting.

Tri P1 nalaza potkopavaju deklarisanu tamper-evident garanciju. Prvo, hash uključuje `actorUserId` i `organizationalUnitId`, dok obje FK relacije koriste `onDelete:SetNull`. Brisanje korisnika ili OU-a automatski mijenja već hashirani sadržaj i garantovano čini chain nevažećim. Drugo, writeri po defaultu uvijek koriste SHA-256; konfigurisani `sha384/sha512` dobija samo nekolicina poziva, dok verifier cijeli chain provjerava jednim trenutno konfigurisanim algoritmom. Algoritam nije pohranjen u redu, pa promjena konfiguracije ili mješoviti writeri proizvode chain koji se ne može korektno potvrditi. Treće, chain koristi običan neključani hash, a checkpointi i svi hash redovi žive u istoj izmjenjivoj bazi. Akter sa DB write pristupom može izmijeniti sadržaj i ponovo izračunati cijeli chain/checkpoint bez vanjskog potpisa ili anchor dokaza.

Dodatni rizici su neatomarna privacy redakcija i njen nehashirani `redactedAt`, neograničeni export/verify koji učitavaju kompletan scope/chain u memoriju, globalni append lock kao cluster-wide write bottleneck, proizvoljna metadata bez centralnog sensitivity/size ugovora, hash envelope koji ne veže ID/vrijeme/algoritam/redaction state i potpuno povjerenje u denormalizovani OU scope koji dostavi producer.

## 2. Scope i inventar

| Metrika                    |                                                  Vrijednost |
| -------------------------- | ----------------------------------------------------------: |
| TypeScript fajlovi         |                                                          28 |
| Produkcijski fajlovi       |                                                          21 |
| Spec fajlovi               |                                                           7 |
| Produkcijske linije        |                                                       1.625 |
| Kontroleri                 |                                                           1 |
| Servisi                    |                                                           1 |
| Direktne module zavisnosti | `authentication`, `authorization`, `change-log`, `settings` |

Pregledane povezane površine:

- Prisma `AuditLog` i `AuditChainCheckpoint` modeli;
- svi direktni audit writer importi kroz backend module;
- privacy audit metadata redaction;
- retention purge/checkpoint tok;
- users i organizational-units hard delete FK ponašanje;
- security-audit webhook kao downstream potrošač;
- settings hash/export/tamper-evident konfiguracija;
- E2E 12, 17, 18, 19 i 38 te svih sedam direktnih spec fajlova.

## 3. Arhitektura i write lifecycle

### 3.1. Append

`appendAuditLog` očekuje postojeći transaction client:

1. uzima globalni transaction-scoped PostgreSQL advisory lock;
2. čita posljednji red po `createdAt DESC, id DESC`;
3. koristi njegov hash ili genesis od 64 nule;
4. računa SHA-256 canonical metadata digest;
5. računa v2 chain hash preko prethodnog hasha, action/entity/actor/request/OU i metadata digesta;
6. kreira `AuditLog` red u istoj transakciji pozivaoca.

`recordAuditEntry` otvara vlastitu transakciju kada caller nije već dao transaction client. Velik dio domenskih modula direktno zove `appendAuditLog` unutar svoje transakcije, što dobro veže business write i audit write.

### 3.2. Read/list

- controller traži session, ADMIN role i `audit.export` permission;
- list dodatno koristi `OuAccessGuard` nad traženim OU-om;
- servis ponovo gradi traženi OU subtree i query ograničava na njegove ID-eve;
- samo SuperAdmin dobija globalne `organizationalUnitId=null` redove;
- stranica je ograničena na najviše 200 i koristi cursor;
- actor display name učitava se jednim dodatnim queryjem po stranici;
- response ima `Cache-Control:no-store`.

### 3.3. Export

- export može biti globalno ugašen i format ograničen na CSV/JSON;
- koristi isti OU subtree model i samo SuperAdmin globalne redove;
- učitava sve redove scopea, serializuje ih u jedan string/Buffer i tek zatim piše `audit.export` zapis;
- export zapis nosi format, broj redova, actor, request ID i OU.

### 3.4. Verify, redaction i retention

- verify učitava i sortira cijeli preostali chain;
- v1 hashira metadata direktno; redacted v1 vjeruje stored hashu kao sealed link;
- v2 hashira stored metadata digest; za neredigovan red ponovo računa digest iz metadata;
- za redigovan v2 red metadata se više ne poredi s originalnim digestom;
- retention briše prefix pod chain lockom i pravi checkpoint sa hashom zadnjeg obrisanog reda;
- privacy redaction mijenja metadata/redactedAt red po red izvan jedne velike transakcije, pa naknadno appenduje zbirni `audit.redacted` događaj.

## 4. API/guard/scope matrica

| Ruta                             | Role/permission                        | OU scope                                | Operativni trošak          |
| -------------------------------- | -------------------------------------- | --------------------------------------- | -------------------------- |
| `GET /audit-logs`                | ADMIN + `audit.export`                 | obavezan OU + subtree; SA vidi globalne | take 1–200                 |
| `GET /audit-logs/export`         | ADMIN + `audit.export`                 | obavezan OU + subtree; SA vidi globalne | kompletan scope u memoriji |
| `POST /audit-logs/verify`        | ADMIN + `audit.export`                 | nema OU; globalni integrity rezultat    | kompletan chain u memoriji |
| interni `listAuthSecurityEvents` | caller mora biti SA u svom controlleru | globalni samo `auth.*`                  | take/cursor u repositoryju |
| interni `snapshotExportJson`     | nema vlastiti guard                    | caller-owned                            | kompletan chain            |

Pozitivno, list/export imaju defense-in-depth: route guard i servisni subtree filter. Verify ne vraća sadržaj, ali izlaže globalni status/count/mismatch ID svakom globalnom holderu `audit.export` permissiona.

## 5. Hash-chain i Prisma analiza

### Hashirani elementi

V2 canonical payload veže:

- action;
- entity type i entity ID;
- actor user ID;
- previous hash;
- request ID kada postoji;
- organizational unit ID kada postoji;
- hash version;
- metadata digest.

Ne veže:

- audit row ID;
- `createdAt`;
- hash algorithm/key ID;
- `redactedAt`;
- retention/checkpoint identitet;
- schema/event version izvan hashVersiona.

### Referencijalno ponašanje

`AuditLog.actorUserId → User` i `organizationalUnitId → OrganizationalUnit` imaju `onDelete:SetNull`. Oba polja su dio canonical hash payload-a kada postoje. Baza ih zato može legitimno promijeniti bez promjene stored hasha. Ovo nije teorijski DB attacker scenario, nego normalan hard-delete lifecycle koji postoji u users i OU API-jima.

### Algoritam

`appendAuditLog` prima opcionalni algoritam, ali većina producer poziva ga ne šalje i koristi `defaultAuditHashAlgorithm='sha256'`. `AuditLogService.export` eksplicitno šalje trenutno konfigurisani algoritam. Verifier uzima jedan trenutni setting i njime provjerava sve redove. Red nema algorithm kolonu.

### Anchor model

Hash je SHA-2, ne HMAC/digital signature. Checkpoint s `throughHash` nalazi se u istoj DB. Ne postoji external immutable/WORM anchor, transparency log, signed checkpoint ili key ID. Chain dobro otkriva slučajnu/naivnu izmjenu, ali nije dokaz protiv privilegovanog DB writera koji može recomputeovati suffix ili cijelu historiju.

## 6. Scope i privilege-escalation pregled

Nije pronađen direktan HTTP bypass koji scoped ADMIN-u vraća drugi OU. `OuAccessGuard` provjerava traženi OU, a servis zatim bira samo taj subtree. Globalni događaji ostaju SuperAdmin-only.

Međutim, visibility svakog zapisa zavisi od `organizationalUnitId` koji caller/proizvođač ručno prenosi u `RecordAuditEntryInput`. `appendAuditLog` ne može dokazati da entity stvarno pripada tom OU-u. Pogrešan ili izostavljen producer scope može:

- sakriti događaj od legitimnog scoped auditora kao globalan;
- prikazati metadata auditoru pogrešnog OU-a;
- nakon OU deletea automatski pretvoriti scoped red u globalni null red i istovremeno prekinuti chain.

Ovo je producer-contract rizik, ne pronađena namjerna horizontalna eskalacija u samom controlleru.

## 7. Privatnost i metadata

`RecordAuditEntryInput.metadata` prihvata generički `JsonValue`. Modul nema action-specific schema, PII klasifikaciju, secret detector ni size limit. Produceri odlučuju šta ulazi u audit. Već auditirani users modul pokazuje konkretan primjer direktnog e-maila u delete metadata.

Privacy scrubber može naknadno redigovati metadata i v2 chain zadržava originalni digest. To omogućava dokaz da redigovani sadržaj više nije originalan, ali ne dokazuje šta je originalni sadržaj bio bez vanjskog anchor/escrowa. `redactedAt` nije hashiran. Redaction radi više pojedinačnih updatea, a zbirni audit entry nastaje poslije petlje; process crash može ostaviti parcijalno redigovane redove bez završnog authorization događaja.

## 8. Testovi i izvršeni gateovi

### 8.1. Postojeći dokazi

Sedam spec fajlova pokriva:

- canonical hash i metadata digest;
- v1/v2 verify, mismatch i checkpoint;
- redacted/sealed semantics;
- transactional record helper;
- repository pagination i auth journal filter;
- OU-scoped export/global SuperAdmin ponašanje;
- CSV/JSON serializaciju.

Nedostaju integracijski testovi za User/OU `SetNull` chain lom, promjenu/miješanje algoritma, external anchor threat model, concurrent privacy redaction, veliki export/verify, global lock throughput i producer metadata/scope schema.

E2E 12/17/18/19 provjeravaju da report/export događaji postoje u OU audit listi. E2E 38 potvrđuje request-linked SuperAdmin bypass audit. Nema E2E chain verify poslije user/OU hard deletea ili hash-algorithm promjene.

### 8.2. Lokalni rezultat

```bash
npx jest --runInBand src/modules/audit-log
```

Rezultat:

- **7 suiteova otkriveno**;
- **5 suiteova prošlo**;
- **14/14 izvršenih testova prošlo**;
- **2 suitea nisu kompajlirana** zbog nedostajućeg generated Prisma klijenta i posljedičnih `PrismaService` type grešaka.

Ovo nije zeleni gate. Blokada je isti checkout reproducibility problem evidentiran u modulima 01–07.

## 9. Pozitivni nalazi

1. Business mutation i audit često commitaju u istoj DB transakciji.
2. Globalni PostgreSQL advisory lock sprečava fork chain pri konkurentnim appendima.
3. V2 koristi canonical SHA-256 metadata digest i versionirano verify ponašanje.
4. List/export imaju OU guard i nezavisni servisni subtree filter.
5. Globalni audit redovi dostupni su samo SuperAdmin kontekstu.
6. List je bounded na 200 i cursor-paginiran.
7. Export je feature/format gated, `no-store` i sam se auditira s request ID-em.
8. Secret vrijednost se ne generiše niti posebno otkriva iz settings sloja kroz ovaj modul.
9. Retention koristi chain lock i checkpoint umjesto slijepog prefix deletea.
10. Auth security journal query hardkodira `auth.*` filter u repositoryju.

## 10. Registar nalaza

| ID              | Severity | Naslov                                                                          | Status   | Veličina |
| --------------- | -------- | ------------------------------------------------------------------------------- | -------- | -------- |
| BA-audit-log-01 | P1       | User/OU `SetNull` mijenja hashirani payload i lomi chain pri normalnom deleteu  | završen (W3.2) | L        |
| BA-audit-log-02 | P1       | Hash algoritam nije pohranjen po redu i writeri ignorišu globalnu konfiguraciju | završen (W3.2) | L        |
| BA-audit-log-03 | P1       | Neključani chain i checkpoint u istoj bazi nemaju external tamper anchor        | završen (W3.4) | L        |
| BA-audit-log-04 | P2       | Privacy redaction nije atomska, a redaction state nije hashiran/autentificiran  | završen (W3.5) | L        |
| BA-audit-log-05 | P2       | Export i verify učitavaju kompletan scope/chain u memoriju bez limita           | otvoreno | M        |
| BA-audit-log-06 | P2       | Jedan globalni advisory lock serijalizuje sve auditirane write transakcije      | otvoreno | M        |
| BA-audit-log-07 | P2       | Metadata nema action-specific schema, sensitivity policy ni size budget         | otvoreno | L        |
| BA-audit-log-08 | P2       | Hash envelope ne veže row ID, vrijeme, algoritam ni redaction state             | završen (W3.3) | M        |
| BA-audit-log-09 | P2       | OU visibility vjeruje denormalizovanom producer scopeu bez provenance provjere  | otvoreno | M        |
| BA-audit-log-10 | P3       | Cursor/ID/query stringovi nemaju format i dužinske granice                      | otvoreno | S        |
| BA-audit-log-11 | P3       | Action/entityType su otvoreni stringovi bez runtime kataloga/schema versiona    | otvoreno | M        |

## 11. Detaljni nalazi

### BA-audit-log-01 — Referencijalni delete mijenja hashirani sadržaj

- **Dokaz:** canonical payload uključuje actor/OU ID; Prisma oba FK-a definiše sa `onDelete:SetNull`. Stored hash i metadata digest se ne mijenjaju pri FK akciji.
- **Scenarij:** audit red sa `actorUserId=user-1` i `organizationalUnitId=ou-1` je validan. Hard delete usera ili OU-a postavi polje na null. Verify računa payload s null/izostavljenim poljem i prijavljuje mismatch.
- **Uticaj:** legitimni lifecycle trajno ruši tamper-evident provjeru, pa operator ne može razlikovati očekivani delete od napada. OU red dodatno mijenja visibility iz scoped u globalnu.
- **Korekcija:** audit identifikatori moraju biti immutable value polja bez FK `SetNull`, ili odvojiti immutable hashed actor/scope ID od nullable display relationa. Migrirati postojeće redove uz signed checkpoint.
- **Acceptance:** hard delete usera i OU-a ne mijenja canonical audit red, visibility historije ostaje dokumentovana, a full verify ostaje validan.
- **Owner:** audit-log + users/organizational-units/data owner.

### BA-audit-log-02 — Mješoviti/nepoznati hash algoritam

- **Dokaz:** default writer je SHA-256; konfiguracija dopušta SHA-256/384/512; samo caller koji eksplicitno pošalje algoritam ga koristi. Red ne čuva algoritam. Verify koristi jedan trenutni setting za cijeli chain.
- **Uticaj:** promjena settinga ili export audit između običnih događaja pravi mješovit chain koji verifier nužno označava nevažećim. Povratak settinga samo mijenja koji segment pada.
- **Korekcija:** algoritam i key/version moraju biti po redu i hashirani; svi writeri koriste centralni policy loader ili chain epoch; promjena algoritma otvara eksplicitni signed epoch/checkpoint, ne retroaktivno pravilo.
- **Acceptance:** chain sa kontrolisanom SHA-256→SHA-512 rotacijom verifikuje svaki red njegovim algoritmom; nijedan writer ne može prećutno pasti na default.
- **Owner:** audit-log + settings owner.

### BA-audit-log-03 — Chain nije dokaz protiv DB writera

- **Dokaz:** hash je javni SHA-2 bez tajnog ključa; svi row podaci, genesis pravilo i checkpoint su u istoj izmjenjivoj bazi. Nema external/WORM/signed anchor.
- **Uticaj:** privilegovani DB napadač može promijeniti historiju i recomputeovati cijeli suffix/chain/checkpoint. `verify` tada vraća validno, pa „tamper-evident“ garancija ne pokriva najvažniji storage threat.
- **Korekcija:** periodični signed/HMAC checkpoint s keyem izvan DB-a i external immutable sink/WORM/transparency log; pohraniti anchor ID/time/chain head i nadzirati publish lag.
- **Acceptance:** DB-only recompute ne prolazi external anchor verify; gubitak/lag anchora proizvodi alarm, ne lažno zelen status.
- **Owner:** security/platform + audit-log owner.

### BA-audit-log-04 — Redaction nema atomski authorization envelope

- **Dokaz:** privacy petlja pojedinačno updateuje metadata/redactedAt izvan jedne transakcije i tek poslije appenduje `audit.redacted`. `redactedAt` nije hashiran; verifier za redacted v2 ne poredi novu metadata s originalnim digestom.
- **Uticaj:** crash ostavlja parcijalnu redakciju bez zbirnog traga. DB writer može označiti red redigovanim i proizvoljno promijeniti metadata, a lokalni verifier i dalje vjeruje originalnom stored digestu/hashu.
- **Korekcija:** durable redaction job/batch state, per-batch signed authorization manifest i atomic/batched updates; redaction marker/manifest ID uključiti u novi hash epoch ili external anchor dokaz.
- **Acceptance:** crash/retry završava exactly-once manifestom; neautorizovani `redactedAt+metadata` update pada verify/anchor provjeru.
- **Owner:** privacy + audit-log owner.

### BA-audit-log-05 — Neograničen export/verify

- **Dokaz:** `listForExport` i `listChain` rade `findMany` bez take/streaminga; service zatim kreira rows array, JSON/CSV string i Buffer. Verify dodatno kopira/sortira cijeli chain.
- **Uticaj:** veliki višegodišnji audit može iscrpiti heap, blokirati event loop ili timeoutovati; privilegovani/kompromitovani korisnik može ponavljati zahtjev kao aplikacijski DoS.
- **Korekcija:** cursor streaming/chunked export, async export job/object storage, hard date/row/byte budget; incremental verify i checkpointed background verification.
- **Acceptance:** višemilionski fixture ostaje unutar memory/latency budžeta; HTTP ne gradi cijeli export u RAM-u.
- **Owner:** audit-log/platform owner.

### BA-audit-log-06 — Globalni chain lock je write bottleneck

- **Dokaz:** svaki append uzima isti `pg_advisory_xact_lock(871001)`, često unutar poslovne transakcije nakon drugih writeova.
- **Uticaj:** svi auditirani moduli cluster-wide serijalizuju commit; spor/blocked transaction povećava tail latency i lock contention, a različit lock ordering s budućim tokovima povećava deadlock rizik.
- **Korekcija:** mjeriti lock wait; razmotriti append-only sequence/ledger writer ili outbox sa transakcijskim eventom i determinističkim chain workerom, uz očuvanje no-loss ugovora.
- **Acceptance:** definisani peak audit throughput bez business timeouta; fault ne gubi event; lock wait/deadlock metrički vidljivi.
- **Owner:** audit-log/platform owner.

### BA-audit-log-07 — Otvorena metadata površina

- **Dokaz:** input prihvata bilo koji `JsonValue`; nema action schema, secret/PII detectora, max bytes/depth ni centralnog allowlista. Producer direktno bira metadata.
- **Uticaj:** credential/PII se može trajno zapisati i izvesti; ekstremna metadata povećava DB, hash, export i redaction trošak. Raniji `BA-users-09` dokazuje konkretan PII primjer.
- **Korekcija:** versionirani action schema registry sa sensitivity klasama, field allowlist/redaction i byte/depth limitom prije append-a.
- **Acceptance:** raw secret/e-mail u zabranjenom action polju pada ili se pseudonimizuje; oversized/deep metadata pada kontrolisano; svaki action ima schema version.
- **Owner:** audit-log/security/privacy owner.

### BA-audit-log-08 — Nepotpuni canonical envelope

- **Dokaz:** hash ne uključuje row ID, createdAt, algorithm ni redactedAt. Chain ordering zavisi od createdAt/id koje hash ne autentificira.
- **Uticaj:** vrijednosti se mogu mijenjati unutar intervala gdje ne promijene link ordering ili mogu promijeniti export/forenzički identitet bez direktnog hash mismatcha; algorithm/redaction semantika dolazi izvan reda.
- **Korekcija:** v3 envelope sa immutable event ID, server timestamp/sequence, algorithm/key ID, schema version i redaction/epoch modelom; DB generisanje vrijednosti uskladiti prije hashiranja.
- **Acceptance:** promjena bilo kojeg forenzički prikazanog immutable polja ruši verify/anchor provjeru.
- **Owner:** audit-log owner.

### BA-audit-log-09 — Scope provenance nije potvrđen

- **Dokaz:** producer šalje nullable `organizationalUnitId`; append ne provjerava entity→OU odnos niti action scope pravilo. Read autorizacija vjeruje tom polju.
- **Uticaj:** producer bug može sakriti zapis od scoped auditora ili izložiti metadata drugom OU scopeu. Brisanje OU-a dodatno mijenja scope na null.
- **Korekcija:** action schema definiše scope resolver/provenance; critical producer prosljeđuje entity ID, a centralni writer u transakciji derivira ili potvrđuje OU. Immutable historical scope ostaje nakon OU deletea.
- **Acceptance:** namjerno pogrešan producer OU ne može commitovati; scope-less action mora biti eksplicitno deklarisan globalnim.
- **Owner:** audit-log + domain owners.

### BA-audit-log-10 — Slabe granice query identifikatora

- **Dokaz:** OU ID i cursor imaju samo string/MinLength; nema MaxLength ni CUID/opaque-ID limita. Nepostojeći cursor može procuriti kao ORM greška zavisno od Prisma ponašanja.
- **Uticaj:** nepotreban parser/DB rad i nestabilan 4xx/5xx ugovor za malformed/oversized input.
- **Korekcija:** zajednički bounded opaque-ID pipe, cursor envelope/potpis ili najmanje format+length validacija i stabilan invalid-cursor kod.
- **Acceptance:** malformed/oversized OU/cursor završava 400 prije repositoryja.
- **Owner:** audit-log API owner.

### BA-audit-log-11 — Otvoreni action/entity stringovi

- **Dokaz:** constants katalog postoji, ali write tip prihvata proizvoljan string i runtime ga ne potvrđuje; nema per-action schema/version veze.
- **Uticaj:** typo pravi novi event class koji security journal/filter/retention/webhook možda ne prepoznaje; isti action može vremenom promijeniti metadata oblik bez verzije.
- **Korekcija:** typed/runtime action registry sa entity typeom, schema versionom, scope i sensitivity pravilima; eksplicitni extension namespace za integracije.
- **Acceptance:** unknown action/entity/schema kombinacija ne može commitovati bez registrovanog extensiona.
- **Owner:** audit-log owner.

## 12. Baseline score

| Presjek                  |   Težina | Ocjena | Ponderisano | Obrazloženje                                                         |
| ------------------------ | -------: | -----: | ----------: | -------------------------------------------------------------------- |
| Arhitektura              |      10% |   7,30 |        0,73 | jasan ledger API; globalni lock i anchor granica ograničavaju dizajn |
| API i ugovori            |      12% |   8,00 |        0,96 | jaka OU/paging osnova; export/cursor/action ugovor nepotpun          |
| AuthN/AuthZ/scope        |      15% |   8,50 |        1,28 | defense-in-depth scope; producer provenance ostaje trust boundary    |
| Poslovna pravila         |      13% |   5,50 |        0,72 | retention/redaction model postoji; normalni delete lomi invariant    |
| Podaci i transakcije     |      13% |   4,50 |        0,59 | atomic append, ali FK mutabilnost i algorithm model su fundamentalni |
| Sigurnost i privatnost   |      12% |   4,50 |        0,54 | bez external anchora; metadata/redaction slabosti                    |
| Async/integracije        |       8% |   7,00 |        0,56 | široka integracija i no-loss transakcije; centralna schema nedostaje |
| Testovi                  |      10% |   6,80 |        0,68 | dobri hash testovi; ključni FK/algo/anchor/load scenariji nedostaju  |
| Operativnost/performance |       7% |   4,80 |        0,34 | no-store/paging lista; full export/verify i globalni lock            |
| **Ukupno**               | **100%** |        | **6,38/10** | tri P1 nalaza ograničavaju baseline                                  |

Tačna suma nezaokruženih presjeka korištenih za baseline iznosi **6,38/10**; prikazane ponderisane ćelije su zaokružene na dvije decimale. Kanonska ocjena ostaje **6,38/10**, bez ručnog podizanja.

## 13. Fazni plan popravki

### Faza 0 — safety net

- full verify prije/poslije hard deletea usera i OU-a;
- mixed SHA-256/384/512 i algorithm rotation test;
- DB-only chain recompute/external anchor threat test;
- crashable privacy redaction test;
- million-row export/verify memory benchmark;
- chain lock contention, metadata/schema/scope i malformed cursor testovi.

### Faza 1 — immutable ledger model

- odvojiti immutable actor/scope value ID od display FK relacija;
- ukloniti `SetNull` sa hashiranih polja ili prestati hashirati mutable FK kolonu uz novu immutable kopiju;
- v3 envelope sa event ID, sequence/time, algorithm/key/schema versionom;
- migration epoch/checkpoint za postojeći chain.

### Faza 2 — algorithm i external anchoring

- per-row algorithm/key ID;
- centralni chain policy za sve writere;
- signed/HMAC checkpoint s keyem izvan DB-a;
- external WORM/transparency sink i anchor lag alarm;
- kontrolisana algorithm/key rotacija.

### Faza 3 — privacy i metadata ugovor

- action schema registry sa sensitivity/scope/version pravilima;
- durable redaction batch manifest i retry;
- autentificiran redaction/retention epoch;
- PII/secret detector i byte/depth budget;
- historijski immutable OU scope.

### Faza 4 — skaliranje i operativnost

- streaming/async export sa row/date/byte budgetom;
- incremental/background verify sa signed checkpointom;
- lock-wait/deadlock/chain-head/anchor metrike;
- procijeniti transactional outbox + deterministic ledger worker bez audit gubitka.

### Faza 5 — API i producer migracija

- bounded/signed cursor;
- registry-enforced action/entity/schema;
- migrirati sve producere na centralni context/scope resolver;
- request ID obavezan za HTTP-origin događaje;
- dokumentovati global/system event pravila.

### Faza 6 — završna verifikacija

- svih 7 suiteova zeleno sa generated Prisma klijentom;
- ciljani E2E 12, 17, 18, 19 i 38 plus delete/algo/anchor scenariji;
- stvarni PostgreSQL FK/retention/concurrency testovi;
- load, failover, anchor outage i restore rehearsal;
- nezavisna security/compliance provjera ledger garancije.

## 14. Rizik, rollback i acceptance

### Rizik implementacije

Promjena canonical envelopea i immutable FK modela zahtijeva chain epoch, ne in-place recompute bez dokaza. External anchor uvodi key custody i dostupnost. Streaming export mijenja API delivery model. Migracija više desetina producera mora očuvati transakcijsku atomicity i OU visibility.

### Rollback

- v3 se uvodi kao novi chain epoch uz očuvan read/verify v1/v2;
- stare hash vrijednosti se ne prepisuju bez signed migration manifesta;
- immutable actor/scope kolone se prvo backfilluju i dual-writeaju;
- external anchor outage ne blokira business write beskonačno: durable pending anchor + strogi alert/SLO;
- async export može zadržati mali bounded sync export;
- rollback ne smije ponovo uključiti `SetNull` nad canonical poljima.

### Globalni acceptance

1. User/OU delete ne mijenja canonical historijski događaj niti lomi verify.
2. Svaki red se provjerava algoritmom/key epochom kojim je nastao.
3. DB-only rewrite/recompute ne može proći external anchor provjeru.
4. Redaction je durable, autorizovana i crash-safe.
5. Export/verify imaju bounded memory i operativni budget.
6. Peak audit throughput ne serializuje business sistem izvan definisanog SLO-a.
7. Svaki action ima schema, sensitivity, scope provenance i size limit.
8. Svako forenzički immutable polje je kriptografski vezano.

## 15. Traceability

| Nalaz           | Kod/dokaz                           | Test                            | Faza  |
| --------------- | ----------------------------------- | ------------------------------- | ----- |
| BA-audit-log-01 | AuditLog schema + canonical payload | user/OU delete full verify      | 0–1   |
| BA-audit-log-02 | append default + config/verifier    | mixed algorithm rotation        | 0–2   |
| BA-audit-log-03 | SHA chain + DB checkpoint           | DB recompute vs external anchor | 0–2   |
| BA-audit-log-04 | privacy redaction + verifier        | crash/unauthorized redaction    | 0–3   |
| BA-audit-log-05 | listForExport/listChain             | million-row memory/load         | 0–4   |
| BA-audit-log-06 | global advisory lock                | concurrent audited writes       | 0–4   |
| BA-audit-log-07 | generic JsonValue metadata          | secret/PII/size schema          | 0–3   |
| BA-audit-log-08 | canonical payload fields            | immutable-field tamper          | 0–1   |
| BA-audit-log-09 | producer organizationalUnitId       | wrong/missing scope             | 0–3/5 |
| BA-audit-log-10 | query DTO                           | malformed/oversized cursor      | 0–5   |
| BA-audit-log-11 | string action/entity types          | unknown/schema drift            | 0–3/5 |

## 16. Otvorene pretpostavke

- Threat model za „tamper-evident“ nije eksplicitno ograničen na slučajnu izmjenu; zato audit ocjenjuje privilegovanog DB writera kao relevantnu enterprise prijetnju.
- Disk/database encryption ne daje ledger authenticity niti sprečava DB operatora da recomputeuje neključani chain.
- Security-audit webhook može biti osnova za external anchor, ali njegova trenutna delivery semantika biće posebno auditirana u modulu 10 i ovdje nije tretirana kao kriptografski WORM dokaz.
- Privacy i retention detalji biće ponovo pregledani u modulu 11; ovdje su ocijenjene njihove direktne posljedice na audit chain.
- Korisnik je potvrdio kompletan CI/Playwright prolaz, ali postojeća kolekcija nema FK delete, mixed-algorithm, external-anchor i load scenarije.
