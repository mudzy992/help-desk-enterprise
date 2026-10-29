# Backend audit 22 — `assets`

**Status:** audit završen<br>
**Datum:** 2026-10-23<br>
**Rizik modula:** visok<br>
**Baseline ocjena:** **4,59/10**<br>
**Nalazi:** 4 P1, 11 P2, 4 P3<br>
**Implementacija:** W7.1 zatvorio je `BA-assets-01`, W7.2 `BA-assets-02`, W7.3 `BA-assets-03`, W7.4 `BA-assets-04`, a W7.5 samo `BA-assets-05`; `BA-assets-06`–`BA-assets-19` ostaju otvoreni.

## 1. Executive summary

`assets` je širok CMDB domen: tipovi i custom atributi, lokacije, asset CRUD/status/custody, relacije i impact, ticket veze, licence i ugovori, spreadsheet import/export, directory sync, transferi sa DOCX/signed kopijom te expiry reminders. Pozitivna osnova je značajna: OU subtree filteri i not-found direct-ID semantika, optimistic version kod općeg edita i transfera, transactional asset eventi, AES-GCM ključevi, formula escaping, apply-time scope revalidacija, frozen transfer snapshot, DB sekvenca, ClamAV i contained storage path.

Baseline je **4,59/10**. Četiri početna P1 nalaza pogađala su authorization, povjerljivost, custody integritet i operativnu isporuku: globalni bypass za scoped ADMIN, foreign asset metadata leak, stale status/custody mutacije i reminder threshold koji se označavao poslanim bez primaoca ili potvrđene isporuke. W7.1–W7.4 su zatvorili sva četiri; W7.5 je zasebno zatvorio P2 DB invariant za unique custom JSON atribut. Preostali assets nalazi ostaju zasebni i otvoreni.

Dodatni nalazi uključuju cross-OU license user assignment, process-local directory lock, primarni ticket link bez DB invariant-a, nedurable extra-recipient email, boot-only schedulere, hard truncation, non-atomic business audit i lifecycle/retention nedostatke. Nema P0. Baseline ocjena i audit opis ostaju snapshot početnog stanja; W7.1–W7.5 closeout dokazi su evidentirani na kraju ovog dokumenta.

## 2. Scope i inventar

- 44 produkcijska TypeScript fajla;
- 13 direktnih specova;
- 9.009 aktuelnih produkcijskih LOC;
- 2 controllera, 13 injectable servisa/komponenti i 2 BullMQ procesora;
- Prisma: tipovi, atributi, lokacije, asseti/eventi/relacije, ticket linkovi, ugovori, licence, import jobovi, directory podaci, transferi/template/signatories;
- integracije: authorization/RBAC, OU/users/groups/services, tickets, settings, audit-log, notifications/email, privacy, BullMQ, filesystem i ClamAV;
- primarni E2E dokaz: 23–28; reference 10 i 56.

Registarskih 9.053 LOC korigovano je na 9.009.

## 3. Authorization, OU scope i field exposure

Većina list/detail/write putanja koristi centralni `AssetAccessService`, OU path + subtree i uniformni not-found za foreign direct ID. Import apply ponovo računa aktuelni actor scope. Transfer manager mora imati manage scope nad svim aktuelnim itemima. To su dobre granice.

Auditom je utvrđeno da je `assetViewerFromContext` označavao svaki ADMIN/SUPER_ADMIN assignment globalnim, neovisno o `organizationalUnitPath`, pa je scoped ADMIN dobijao installation-wide pristup. `BA-assets-01` zatvoren je u W7.1: globalni scope sada zahtijeva installation-wide assignment, a OU-scoped grant zadržava assignment path za sve asset permissione; detalj je u [W7.1 implementacijskom dokazu](../implementation/87-domain-assignment-scope.md).

`BA-assets-02` je reprodukovao cross-OU graph leak: `relationsOf()` vraćao je foreign asset ID/tag/name/status/type, a contract detail vraćao je tag/name/status uz `canOpen=false`. W7.2 zatvorio je taj leak scope-filterom u DB upitima prije response shapeanja: relation prikaz vraća samo čvorove u read scopeu, a foreign veze samo kao agregatni hidden count; contract detail vraća samo scope-vidljive assete i hidden item count. Impact endpoint ostaje isti hidden-count obrazac. Scope granica za mutacije cross-OU relation edgea ostaje odvojeno otvorena u dijelu 5 i nije zatvorena ovim paketom.

Ticket requester namjerno vidi plain linked equipment, dok staff dobija `canOpen`; picker je ograničen na vlastitu aktivnu opremu. Ipak acceptance test mora dokazati da requester ne dobija notes, serial, OU, licence, ugovore ili history i da foreign staff link ne proširuje asset pravo.

## 4. CRUD, status, assignment i delete

Create ima DB unique assetTag i retry za automatski tag. General update koristi `where id+version`, transactional event i version increment; W7.3 je verziju učinio obaveznom i u DTO-u i u servisu, pa izostavljeni token više ne dozvoljava blind overwrite. Directory/transfer putanje također koriste optimistic predicate. DISPOSED je read-only; RETIRED/DISPOSED oslobađa usera i device licence. Hard delete je SUPER_ADMIN-only i zabranjen uz ticket/relation zavisnosti.

Prije W7.3, `changeStatus`, `assign` i `unassign` učitavali su current pa u transakciji radili `update({id})`, bez očekivane verzije/statusa/holdera. Paralelni manager zahtjevi ili direktni move nasuprot transferu mogli su vratiti asset starom/drugom holderu, emitovati event prema zastarjelom `assignedUserId`, osloboditi licence na osnovu zastarjelog statusa ili završiti sa custody stanjem koje ne odgovara nijednom event toku.

W7.3 sada zahtijeva pozitivan expected `version` na status/assign/unassign i general update. Status/custody mutacije rade transakcijski CAS `id + version + current status + current assignedUserId`, potvrđuju `count === 1` prije događaja/side effecta i mapiraju stale/race rezultat u HTTP 409. Direktni PostgreSQL acceptance testovi dokazuju stale i paralelne requestove, finalni holder/status/version i evente. Ovaj finding je zatvoren; ostali domain scope, audit i lifecycle nalazi ostaju zasebni.

Hard delete ne provjerava transfer items, contract items ili license assignments u vlastitom guardu; FK ponašanje djelimično blokira ili kaskadira, ali API contract zavisi od DB greške. Brisanje asseta kaskadno briše event history, što slabi dokazivost custody historije; formalni retention/legal policy mora odlučiti treba li tombstone umjesto fizičkog brisanja.

## 5. Atributi, lokacije i relacije

Attribute schema validira tip, required/select i bounds. Location tree ima depth/cycle provjere. Directed relation cycle i depth-3 impact postoje, self relation ima aplikacijsku i SQL CHECK zaštitu, a exact edge ima unique indeks.

`isUnique` custom atribut se provjerava query-before-write nad JSON vrijednošću. Nema DB unique indeksa/normalizovane value tabele ni serializable locka; dva paralelna create/update/import zahtjeva mogu oba proći. Potrebna je DB-zaštićena canonical vrijednost `(type, attribute, value)`.

Cycle check se takođe izvršava prije create transakcije; paralelna suprotna directed edge inserta mogu zajedno napraviti ciklus. CONNECTED_TO simetrija ima samo directional composite unique, pa dva paralelna obrnuta inserta mogu sačuvati oba reda. Potrebna je canonical endpoint constraint/locking strategija.

`removeRelation` zahtijeva manage samo nad URL root assetom; ne ponavlja scope nad oba endpointa. Event se piše i na foreign endpoint. Nakon redakcije read prikaza treba eksplicitno definisati može li scoped manager mijenjati cross-boundary edge.

## 6. Licence i ugovori

License key je AES-GCM šifrovan, ne lista se niti exportuje, key ring podržava decrypt rotaciju, a reveal zahtijeva `asset.license.manage` i auditira se. Kind/target i seat compliance su jasni; over-allocation je dozvoljen ali vidljiv. Contract datumi/kind/cost su validirani i link/unlink emituje asset event.

Per-user license assignment prihvata bilo kojeg aktivnog, neanonimizovanog usera po ID-u. Ne provjerava user OU/scope niti kompatibilnost sa OU licence. Scoped license manager tako može vezati i zatim u detailu vidjeti ime/e-mail foreign korisnika. Asset assignment provjerava read scope nad assetom, ali ne zahtijeva da target pripada OU licence; cross-OU compliance semantika nije definirana.

License/contract create, update, delete i reveal rade business write pa zaseban audit helper. Audit failure može vratiti grešku nakon već izvršenog writea/reveala; delete gubi objekt prije audit potvrde. Reveal posebno mora imati pouzdan security audit u istoj kontrolisanoj granici ili fail-closed preauthorization zapis.

Liste koriste hard `listMax`; assignmenti, contract itemi i asset-card licence/ugovori koriste 50/100 limite bez cursora/`hasMore`. Compliance used count može pokazati broj veći od prikazanih assignmenta bez objašnjenja.

## 7. Ticket veze

Ticket access koristi centralni ticket policy. Edit je staff-only, zahtijeva `asset.read`, odbija closed/archived/merged ticket, asset mora biti u read scopeu, a limit je 20. Link/unlink upisuju asset event i ticket system event.

Pravilo „tačno jedan primary dok postoje linkovi“ nije DB invariant. Link/set-primary rade `updateMany(false)` pa `create/update(true)`, a unlink bira oldest. Paralelni link, set-primary, split/merge ili unlink tokovi mogu ostaviti više primarnih ili nijedan; Prisma transakcija bez row locka/serializable izolacije to ne sprječava. Potreban je partial unique indeks za `isPrimary=true`, ticket row lock i deterministična repair/reconciliation putanja.

## 8. Import/export i resource granice

CSV/XLSX parser ograničava veličinu i redove, normalizuje kolone, koristi formula result umjesto izvršavanja formule, a export formula-escapuje ćelije. Preview job pripada actoru; parsed rows su kratkotrajno spremljeni u DB JSON, expire se i brišu. Apply ponovo provjerava aktuelnu permission/OU granicu, što sprječava stale preview privilege escalation.

Claim je CAS `PREVIEW -> expiresAt=now`, ali nema eksplicitno APPLYING stanje/lease. Crash poslije claima može ostaviti job formalno PREVIEW sa isteklim leaseom dok cleanup ne postavi EXPIRED; retry semantika i odgovor nisu dokazani. Velik apply i event set moraju imati jasan transaction timeout i idempotency ugovor.

Unique attribute race i opći optimistic konflikt postoje i kroz import. Parsed rows mogu sadržati serial, cost, notes i custom identifikatore; privacy klasifikacija, TTL dokaz, DB backup retention i redaction moraju biti eksplicitni. E2E ne pokriva crash nakon claima, concurrent apply niti maksimalni workbook memory profil.

## 9. Directory sync i scheduler

Planner razlikuje create/update/adopt/skip/missing, manual assignment pobjeđuje suggestion, missing računar se ne auto-retireuje, a writes koriste verziju gdje je primjenjivo. Setting i addon gate su prisutni.

Single-flight `running` zaštita je in-memory boolean po procesu. Manualni, scheduled i višestruki worker instance runovi mogu se preklopiti. Multi-instance run može duplirati create/adopt plan, međusobno mijenjati missing marker i proizvesti nepouzdan zbirni audit. Potreban je DB/Redis distributed lease sa owner/expiry, run ID i recoveryjem.

Scheduler upisuje repeatable job samo pri bootu. Redis restart/flush ili startup registracijska greška ostavlja sync bez posla do redeploya. Nema periodičnog reconciliationa, last-success age health gatea ni stale-lock/run recovery testa.

## 10. Transferi i signed dokumenti

Transfer je funkcionalno najjači dio modula. Plan provjerava scenario/holder/status; move transaction pravi mjesečni DB-backed sequence, frozen snapshot/items i optimistic update svakog asseta. DOCX template se inspectuje/renderuje/skanira; signed PDF/image ima signature provjeru, size cap, ClamAV, random contained path i cleanup novog fajla na DB failure. Replace briše prethodnu kopiju tek nakon uspješnog updatea.

Template version se računa `latest + 1` u običnoj transakciji. Paralelni upload može dati unique konflikt umjesto uredne alokacije/retrya. Cancel koristi status CAS, što je pozitivno, ali signed fajl ostaje uz cancelled zapis; policy mora eksplicitno odlučiti retention i participant download nakon cancel-a.

Transfer snapshot trajno čuva imena, email, OU/title i asset identifikatore. User anonymization/FK `SetNull` ne rediguje frozen JSON ni signed binary. Nema vidljivog retention/erasure lifecyclea za snapshot, signed file, orphan direktorije ili template BLOB-ove. `mine` i `forAsset` su hard-limitirani bez paginationa.

## 11. Reminders, delivery i recovery

Planner je determinističan i threshold niz sprečava normalan dnevni duplicate. Primaoci se računaju po permission kindu i OU subtreeu; in-app ima dedupe key, a user email koristi centralni durable delivery helper i preference policy.

Baseline kvar BA-assets-04 bio je bezuslovni upis planiranih thresholda nakon pokušaja kanala — uključujući nula recipienta, sve preference OFF, nedostupan SMTP i uhvaćene in-app/email greške. W7.4 zatvara taj kvar: servis prati scoped primaoce, primaoce s barem jednim uključenim kanalom i potvrđenu dostavu po itemu; marker napreduje tek kad svaki takav primalac ima persisted in-app notifikaciju (uključujući stabilni dedupe pogodak) ili e-mail status `SENT`. `CLAIMED`, izuzetak, neuspješna dostava, odsustvo scoped primalaca ili svi scoped kanali OFF ostavljaju prag pending. Hash dedupe ključ je stabilan za retry istog item/type/threshold/datum isteka, a `updateMany` CAS uslov ponovo provjerava datum i izvornu listu pragova prije upisa. Dodatni interni email može zadovoljiti samo item bez scoped primaoca i samo nakon uspješnog slanja; durable status/dedupe za te adrese ostaje odvojeni `BA-assets-11`.

Extra internal recipients idu direktno kroz transport, bez delivery reda/statusa. Crash nakon slanja, a prije marker updatea, može duplirati poruku; failure se samo loguje. Pored toga dobijaju punu installation-wide listu po dizajnu, pa konfiguracija recipienta mora biti strogo global-admin, auditirana i redigovana.

Reminder scheduler, kao directory scheduler, registruje repeatable job samo pri bootu. Nema self-heala nakon Redis gubitka niti health alarma za missing schedule, overdue expiry backlog ili delivery/marker neslaganje.

## 12. Audit, privatnost i operativnost

Asset core events su uglavnom u istoj transakciji sa mutationom. Global audit je često poslije commita; transfer issue/signed/cancel, katalog, licence i ugovori zato mogu uspjeti bez odgovarajućeg audit reda ili klijentu izgledati neuspješno nakon uspješnog writea. Standardizovati transactional audit gdje Prisma transakcija postoji i post-commit outbox gdje postoji filesystem side effect.

History pagination je korektna. Nasuprot tome license/contract/transfer/mine/forAsset i template liste hard-trunciraju. Nema kompletnih metrika za sync/reminder scheduler presence, sync overlap, import stuck claim, over-allocation, reminder delivery backlog, transfer file orphan i audit write failure.

Privacy lifecycle mora pokriti: assigned user/event detail, license assignment user, ticket link, import JSON, directory external ID, transfer snapshot i signed binary. Anonimizacija aktuelnog user reda sama nije dovoljna za denormalizovani snapshot/dokument.

## 13. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/assets -name '*.spec.ts' -print | sort)
```

Rezultat: **6/13 suiteova prošlo, 7/13 compile-blocked; 62/62 izvršena testa prošla**. Blokada je nepotpun generated Prisma client: prvo `Cannot find module '../../generated/prisma/client'` / `../../../generated/prisma/client`, zatim kaskadno nedostaju `asset`, `softwareLicense`, `assetTransfer`, `$transaction` i drugi delegati. Nije zabilježen assertion failure.

Izvršeni testovi pokrivaju rules, attributes/locations, licence helper/cipher, parser/spreadsheet plan, directory planner, reminder planner, transfer plan/number/sequence i DOCX rendering. Compile-blokirani su ključni service/Prisma tokovi.

E2E 23–28 pokrivaju glavni assets UI/API katalog, CRUD, import, directory i transfer tokove, ali ne dokazuju scoped ADMIN, cross-OU graph redakciju, custody concurrency, unique attribute/relation race, primary invariant, cross-OU license user, reminder failure marker, Redis scheduler gubitak, import crash niti privacy/retention lifecycle.

## 14. Pozitivni nalazi

1. Centralni addon/permission/scope servis i OU subtree model.
2. Foreign direct ID se uglavnom skriva kao not-found.
3. AssetTag i directory external ID su DB unique.
4. General edit i transfer koriste optimistic version predicate.
5. Core asset eventi su transakcijski.
6. DISPOSED read-only i status transition matrica.
7. Relation self CHECK, exact unique i impact hidden-count obrazac.
8. AES-GCM license key, key ring i auditiran reveal intent.
9. Ticket central access policy i requester own-asset picker.
10. Formula-safe export i formula-result import.
11. Import apply ponovo provjerava aktuelni scope.
12. Directory manual assignment pobjeđuje suggestion.
13. DB-backed transfer sequence i frozen snapshot.
14. DOCX inspect/render i ClamAV provjera.
15. Signed file signature, size cap, contained path i rollback cleanup.
16. User reminder email koristi centralni delivery/dedupe mehanizam.
17. Svih 62 izvršena testa su zelena.

## 15. Registar nalaza

| ID           | Severity | Nalaz                                                                                         | Status   |
| ------------ | -------- | --------------------------------------------------------------------------------------------- | -------- |
| BA-assets-01 | P1       | OU-scoped ADMIN assignment daje globalni pristup svim assets površinama                       | zatvoreno |
| BA-assets-02 | P1       | Cross-OU relation/contract prikaz otkriva foreign asset ID/tag/name/status/type                | zatvoreno |
| BA-assets-03 | P1       | Status/assign/unassign nemaju version/CAS i mogu pregaziti paralelni custody/transfer          | zatvoreno |
| BA-assets-04 | P1       | Reminder threshold se označi poslanim i bez primaoca ili potvrđene uspješne isporuke           | zatvoreno |
| BA-assets-05 | P2       | Unique custom JSON atribut je read-before-write bez DB zaštite                                | zatvoreno |
| BA-assets-06 | P2       | Parallel relation cycle/symmetric insert može prekršiti graph invariant                        | otvoreno |
| BA-assets-07 | P2       | Per-user license assignment nema user OU/scope kompatibilnost                                 | otvoreno |
| BA-assets-08 | P2       | Ticket primary link nema partial unique/locking invariant                                     | otvoreno |
| BA-assets-09 | P2       | Directory single-flight lock je samo in-memory po procesu                                     | otvoreno |
| BA-assets-10 | P2       | Directory i reminder scheduler nemaju Redis-loss reconciliation                               | otvoreno |
| BA-assets-11 | P2       | Extra reminder email zaobilazi durable delivery i per-recipient dedupe/status                  | otvoreno |
| BA-assets-12 | P2       | License/contract/transfer i drugi business writeovi nisu atomski sa auditom                    | otvoreno |
| BA-assets-13 | P2       | Import claim nema eksplicitno APPLYING lease/recovery/idempotency stanje                       | otvoreno |
| BA-assets-14 | P2       | Transfer snapshot/signed binary nemaju definisan anonymization i retention lifecycle           | otvoreno |
| BA-assets-15 | P2       | Hard delete oslanja se na FK za dio zavisnosti i briše asset event history                    | otvoreno |
| BA-assets-16 | P3       | License/contract/assignment/mine/forAsset liste se tiho hard-trunciraju                        | otvoreno |
| BA-assets-17 | P3       | Template `latest+1` version race vraća konflikt bez alokacijskog retry ugovora                 | otvoreno |
| BA-assets-18 | P3       | Nema scheduler/import/reminder/file-orphan i audit-failure health/metric seta                  | otvoreno |
| BA-assets-19 | P3       | Sedam service suiteova je compile-blocked; nema tražene concurrency/failure E2E matrice        | otvoreno |

## 16. Ključne korekcije

- **01:** zatvoreno u W7.1 — scope ostaje vezan za assignment, a globalni doseg zahtijeva installation-wide grant; detalj u [implementacijskom dokazu](../implementation/87-domain-assignment-scope.md).
- **02:** zatvoreno u W7.2 za relation/contract graph: foreign asset čvorovi se filtriraju prije shapeanja, a prikazuje se samo hidden count; detalj u [W7.2 implementacijskom dokazu](../implementation/88-assets-graph-scope.md). Licence i cross-boundary relation mutacije ostaju zasebni otvoreni scopeovi.
- **03:** zatvoreno u W7.3 — status/assign/unassign imaju obavezni expected version i CAS; generalni update također zahtijeva verziju. Stale conflict vraća HTTP 409 bez eventa ili holder/licence side effecta; detalji su u [W7.3 implementacijskom dokazu](../implementation/89-assets-version-cas.md).
- **04:** zatvoreno u W7.4 — prag po itemu napreduje samo nakon policy-dovoljne, potvrđene primarne dostave ili uspješnog extra slanja kada nema scoped primaoca; datum i izvorna lista pragova štite se CAS uslovom. Detalj u [W7.4 implementacijskom dokazu](../implementation/90-assets-reminder-delivery.md).
- **05:** zatvoreno u W7.5 — DB-maintained canonical vrijednost i unique indeks sprečavaju duple unique custom JSON vrijednosti i pod konkurentnim writeovima; aktivni/catalog/import write paths održavaju isti invariant. Detalj u [W7.5 implementacijskom dokazu](../implementation/91-assets-unique-custom-attribute-constraint.md).
- **11:** ostaje otvoreno — dodatni interni email i dalje nema durable delivery red/status ni per-address dedupe; W7.4 ga ne preuzima kao primarni transport niti zatvara ovaj nalaz.
- **05–06:** normalizovane unique attribute vrijednosti i canonical relation edge/invariant uz DB constraint/locking.
- **07:** user/asset target mora biti u dozvoljenom OU modelu licence; detail redakcija.
- **08:** partial unique primary indeks, ticket lock/serializable update i repair job.
- **09–10:** distributed sync lease, run state, periodični repeatable-job reconcile i health gate.
- **12:** transactional audit ili durable post-commit outbox za filesystem operacije.
- **13:** APPLYING lease sa run tokenom, retry/reconcile i dokumentovanom all-or-nothing semantikom.
- **14–15:** formalni retention/anonymization, orphan file cleanup i tombstone/history odluka.
- **16–19:** cursor/hasMore, atomic template sequence, ops metrike i puna Postgres/Redis/filesystem test matrica.

## 17. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,80 |
| B. API i ugovori             |    12% |   5,20 |
| C. Auth/authz/scope          |    15% |   4,00 |
| D. Poslovna pravila/stanje   |    13% |   4,40 |
| E. Podaci/Prisma/transakcije |    13% |   4,30 |
| F. Sigurnost/privatnost      |    12% |   4,50 |
| G. Async/integracije         |     8% |   3,80 |
| H. Testovi/dokazivost        |    10% |   5,00 |
| I. Operativnost/perf.        |     7% |   4,50 |
| **Ukupno**                   | **100%** | **4,59/10** |

Ponderisani zbir početnog baselinea je 4,594; tadašnji otvoreni P1 nalazi ograničavali su audit maksimum na 7,49. Baseline ocjena se ne preračunava retroaktivno nakon implementacijskih closeouta.

## 18. Fazni plan

### Faza 0 — safety net

Scoped ADMIN/foreign graph; concurrent status/assign/transfer; duplicate unique attribute/cycle/primary; reminder no-recipient/channel failure; cross-OU license user; concurrent directory instances; import crash; Redis flush; transfer anonymization/file orphan.

### Faza 1 — P1 scope i custody

Assignment-derived ADMIN scope, graph redakcija i jedinstveni optimistic CAS ugovor za sve status/custody mutations.

### Faza 2 — reminder delivery i scheduler recovery

BA-assets-04 marker correctness za primarne scoped dostave zatvoren je u W7.4. Preostaju `BA-assets-10` scheduler reconciliation nakon Redis gubitka, `BA-assets-11` durable status/dedupe za extra email i `BA-assets-18` delivery/scheduler health signali; retry/reconcile se ne smatra zatvorenim izvan dokazanog BA-assets-04 toka.

### Faza 3 — DB invarianti i licence

Unique attribute storage, relation canonical/cycle zaštita, primary partial unique, license OU target pravilo i DB-backed template version.

### Faza 4 — import/directory i audit

APPLYING lease/idempotency, distributed directory run lock, bounded recovery te transactional/outbox audit standard.

### Faza 5 — privacy, retention i API completeness

Transfer/import/event anonymization policy, signed/orphan cleanup, delete/tombstone odluka, cursor/hasMore i operations metrics.

### Faza 6 — finalni gate

Regenerisan Prisma client; svih 13 direktnih suiteova; Postgres concurrency, Redis restart, filesystem/ClamAV, delivery failure i E2E 23–28 na finalnom SHA-u.

## 19. Acceptance i konačna presuda

1. Nijedan assignment ne proširuje prava izvan svog OU bez eksplicitnog globalnog scopea.
2. Foreign graph čvor ne otkriva identitet ni kroz relation/contract/license/transfer projekciju.
3. Svaki custody/status write je optimistic i event odgovara stvarno promijenjenom stanju.
4. Unique atribut, graph i primary invariant opstaju pod paralelnim writeovima.
5. Licence se ne mogu vezati za nedozvoljeni foreign user/asset.
6. Reminder se označava završenim samo uz dokazivu delivery semantiku i može se oporaviti nakon crasha.
7. Directory/import/scheduler imaju lease, idempotency i Redis/process recovery.
8. Audit je dokazivo vezan za business mutation.
9. Import JSON, transfer snapshot i signed fajl imaju retention/anonymization/orphan lifecycle.
10. Liste ne trunciraju tiho, health signalizira drift, a kompletni unit/integration/E2E testovi prolaze.

Modul ima ozbiljan i funkcionalno bogat temelj, posebno u transferu, spreadsheet sigurnosti i osnovnom OU modelu. W7.1–W7.4 su zatvorili četiri početna P1 nalaza, a W7.5 je uklonio race za unique custom JSON atribut; otvoreni graph mutability, licence, drugi DB invarianti, scheduler recovery, audit i lifecycle nalazi i dalje znače da modul nije production-grade enterprise CMDB. Iskren početni baseline ostaje **4,59/10**.

## 20. Implementacijski closeout — W7.1 (`BA-assets-01`)

Na SHA `49c6559949606ebd87c867f37fe2ce9f0363d1c0`, uz zeleni CI `40911525016`, `assetViewerFromContext` poštuje assignment OU za `asset.read/manage/import/report/type/license/contract`; samo installation-wide assignment može dati globalni scope. Dodani su regresijski testovi za scoped ADMIN, globalni ADMIN, nedosljedan scope i scoped/globalni SUPER_ADMIN. Nema nove migracije. Baseline ocjena ostaje audit snapshot; ostali assets nalazi su i dalje otvoreni. Zajednički dokaz i CI detalji: [87-domain-assignment-scope.md](../implementation/87-domain-assignment-scope.md).

## 21. Implementacijski closeout — W7.2 (`BA-assets-02`)

W7.2 scope-filtera relation endpoint čvorove prema `asset.read` OU subtreeu i contract iteme prije odgovora; foreign asset ID/tag/name/status/type i relation edge ID se ne vraćaju, već samo agregatni hidden count. PostgreSQL acceptance suite pokriva scope-vidljive root/child relacije u oba smjera, foreign veze, ugovor sa vidljivim i foreign opremom te globalnog čitaoca. Kodni commit je `972e5fffbd00aa5ac398bf62e2900cc1faba7c18`; Prettier korekcija je `b73a7611ae6b25fa2ff052e2d17df1992e4afef5`. Prvi CI `40916554238` pao je samo na frontend Prettier koraku; nakon korekcije finalni CI `40917663219` je zelen. Nema nove DB migracije. Potpuni testni, CI i rollout dokaz je u [88-assets-graph-scope.md](../implementation/88-assets-graph-scope.md); u tom closeoutu `BA-assets-03/04` i ostali nalazi su ostali otvoreni.

## 22. Implementacijski closeout — W7.3 (`BA-assets-03`)

W7.3 zatvorio je `BA-assets-03` nakon što su status/assign/unassign dobili obavezni expected version, a transakcijski CAS uslov obuhvatio `id`, `version`, trenutni status i holdera. Eventi i custody/status side effecti nastaju samo nakon `count === 1`; stale i paralelni gubitnički zahtjevi vraćaju `ASSET_VERSION_CONFLICT` / HTTP 409 bez dodatnog eventa. Osam real-PostgreSQL acceptance testova pokriva stale general PUT/status/assign/unassign, racing stale RETIRED zahtjev i paralelne status/assign/unassign mutacije. Kriterijski retirement interleaving potvrđuje da gubitnički zahtjev ne čisti holdera, ne briše device `LicenseAssignment` i ne emituje unassign/license-release event.

Audit §4 napomena o opcionalnom `version` na generalnom updateu uključena je u ovaj closure kriterij: update DTO/servis sada zahtijeva verziju i neće prihvatiti blind PUT, dok create ostaje versionless. Feature commit je `8f929e0ce8b3bf922ab80e80b5141da20ad2a86a`; dodatni licence-side-effect acceptance test je u commit `4ecbed60244c9da33d3c91fc693f5fac6120399b`. Finalni CI [`40930141682`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40930141682) je zelen na testanom SHA `4ecbed60244c9da33d3c91fc693f5fac6120399b`; backend, PostgreSQL/Redis integration, frontend, docs, container/supply-chain i CI gate prošli su. Push workflow je preskočio E2E jobove i zero high/critical image enforcement prema workflow uslovima; nema CI pada. Lokalni backend generate/build bio je blokiran sandboxom koji ne može dohvatiti Prisma engine, a CI je uspješno generisao client i izvršio suiteove. Nema schema promjene ni DB migracije. Potpuni testni, rollout i API contract dokaz je u [89-assets-version-cas.md](../implementation/89-assets-version-cas.md). `BA-assets-04` i svi drugi susjedni nalazi ostaju otvoreni.

## 23. Implementacijski closeout — W7.4 (`BA-assets-04`)

W7.4 zatvara samo `BA-assets-04`. `AssetRemindersService.run()` sada prati scoped odgovorne korisnike, korisnike s barem jednim uključenim kanalom i potvrđene dostave po stavci; svaki odgovorni korisnik s aktivnim kanalom mora imati persisted in-app notifikaciju ili e-mail receipt sa statusom `SENT`. `CLAIMED`, izuzetak i neuspjela dostava ne napreduju marker. Bez scoped primaoca, kad su svi scoped kanali isključeni ili kad nijedna dostava nije potvrđena, prag ostaje pending. Extra interne adrese se i dalje pokušavaju nezavisno od primarnog neuspjeha, ali mogu zadovoljiti prag samo kada stavka nema scoped primaoca i barem jedno slanje uspije. Upis koristi transakcijski `updateMany` sa CAS uslovima nad statusom retirementa, datumom isteka i izvornom listom marker pragova.

Regresioni suite pokriva sve tri vrste itema (asset warranty, ugovor i licenca), djelimični neuspjeh izolovan na iteme u scopeu tog primaoca, retry-stabilan dedupe, e-mail status `SENT` nasuprot `CLAIMED`, oba kanala neuspješna, nula scoped primalaca, svi kanali OFF, te uspješno/neuspješno slanje dodatnoj internoj adresi bez scoped managera. Kodni i testni commit je `9dc3384d5921f9b31aa399373733a2ef30cca7d9`; finalni CI [`40934782196`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40934782196) je zelen na istom SHA-u. Backend build/lint/suiteovi, PostgreSQL+Redis integracija, frontend, docs guard, container/supply-chain i CI gate prošli su. Push workflow je namjerno preskočio E2E critical flows i install wizard; image vulnerability enforcement korak je `skipped` jer je actionable high/critical count bio nula. Lokalni ciljani Jest nije mogao kompajlirati bez generisanog Prisma klijenta u sandboxu; CI je uspješno validirao/generisao klijent i izvršio backend test suite. Nije bilo neuspjelog CI pokušaja. Nema Prisma schema promjene ni DB migracije; BA-assets-10 (Redis scheduler recovery) i BA-assets-11 (durable/deduplicated extra email) ostaju otvoreni. Nije rađen istorijski backfill/rollback ranije pogrešno napredovanih marker vrijednosti. Detaljan closeout je u [90-assets-reminder-delivery.md](../implementation/90-assets-reminder-delivery.md). W7.5 je kasnije zasebno zatvorio samo `BA-assets-05`; detalj je u narednom closeoutu i njegov CI dokazu.

## 24. Implementacijski closeout — W7.5 (`BA-assets-05`)

W7.5 zatvorio je samo `BA-assets-05` (P2). `AssetUniqueAttributeValue` i PostgreSQL unique `(attributeId, canonicalValue)` indeks sada štite active unique custom JSON vrijednosti od paralelnih manual/import writeova. Migracija `20271027220000_asset_unique_attribute_values` radi duplicate preflight, transactional backfill, type-consistent composite FKs/check i trigger installation; normalizer se održava na asset JSON i catalog isUnique/archive promjenama, a matching DB konflikt zadržava postojeći API duplicate error.

Sedam direktnih PostgreSQL acceptance scenarija pokriva concurrent raw write, manual create/update i parallel update, stale manual-vs-import race u oba ishoda, import UPSERT update i catalog uniqueness/archive transitions. Kodni/testani SHA `c9773edb259756dc34b0dceb59522a4770b2ee7f` i finalni CI [`40942023054`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40942023054) su zeleni. Prisma validate/generate, backend build/test, migration replay i real PostgreSQL suites, frontend, docs guard, container/supply-chain i gate prošli su. Push workflow je preskočio E2E jobove; high/critical image enforcement korak je `skipped` jer je scanner count bio nula. Lokalno je Prisma engine download bio blokiran TLS-om, build nije imao generated client, a direct PostgreSQL nije bio dostupan; ciljani unit/lint/policy/harness provjerama nije utvrđen kvar. Detaljan migration/rollback plan i CI/lokalna matrica su u [91-assets-unique-custom-attribute-constraint.md](../implementation/91-assets-unique-custom-attribute-constraint.md). Nije dodirnut `BA-assets-06`–`BA-assets-19`; sljedeći paket W7.6 (`BA-assets-06`) još nije započet.
