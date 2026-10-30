# Backend audit 22 — `assets`

**Status:** audit završen<br>
**Datum:** 2026-10-23<br>
**Rizik modula:** visok<br>
**Baseline ocjena:** **4,59/10**<br>
**Nalazi:** 4 P1, 11 P2, 4 P3<br>
**Implementacija:** W7.1–W7.6 zatvorili su `BA-assets-01`–`BA-assets-06`; W7.7 je zatvorio samo `BA-assets-07`, W7.8 samo `BA-assets-08`, W7.9 samo `BA-assets-09`, W7.10 samo `BA-assets-10`, W7.11 samo `BA-assets-11`, a W7.12 samo `BA-assets-12`. `BA-assets-13`–`BA-assets-19` ostaju otvoreni.

## 1. Executive summary

`assets` je širok CMDB domen: tipovi i custom atributi, lokacije, asset CRUD/status/custody, relacije i impact, ticket veze, licence i ugovori, spreadsheet import/export, directory sync, transferi sa DOCX/signed kopijom te expiry reminders. Pozitivna osnova je značajna: OU subtree filteri i not-found direct-ID semantika, optimistic version kod općeg edita i transfera, transactional asset eventi, AES-GCM ključevi, formula escaping, apply-time scope revalidacija, frozen transfer snapshot, DB sekvenca, ClamAV i contained storage path.

Baseline je **4,59/10**. Četiri početna P1 nalaza pogađala su authorization, povjerljivost, custody integritet i operativnu isporuku: globalni bypass za scoped ADMIN, foreign asset metadata leak, stale status/custody mutacije i reminder threshold koji se označavao poslanim bez primaoca ili potvrđene isporuke. W7.1–W7.4 su zatvorili sva četiri; W7.5 je zasebno zatvorio P2 DB invariant za unique custom JSON atribut, W7.6 P2 DB graph invariant za directed cycles i simetrične `CONNECTED_TO` duplikate, W7.7 per-user license OU/scope, W7.8 ticket primary-link invariant, W7.9 Redis single-flight lease za directory run, W7.10 scheduler reconciliation/health, W7.11 durable extra reminder dostavu, a W7.12 atomarnost business write/audit događaja. Preostali assets nalazi ostaju zasebni i otvoreni.

Početni audit dodatno je evidentirao cross-OU license user assignment, boot-only schedulere, hard truncation, non-atomic business audit i lifecycle/retention nedostatke. W7.7 je zatvorio samo per-user license target OU/scope dio; W7.8 ticket primary-link invariant; W7.9 process-local directory lock; W7.10 boot-only Redis scheduler recovery i last-success health signal; W7.11 durable extra reminder dostavu; W7.12 atomski business write i postojeći audit zapis. Asset-target cross-OU semantika i ostali nalazi ostaju otvoreni. Nema P0. Baseline ocjena i audit opis ostaju snapshot početnog stanja; W7.1–W7.12 closeout dokazi evidentirani su na kraju ovog dokumenta.

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

W7.6 zatvorio je race u graph invariantima: PostgreSQL sada serijalizuje relation INSERT/UPDATE writeove, statement-level recursive trigger odbija directed cycle, a partial unique indeks nad kanonskim neuređenim endpointima sprečava duple obrnute `CONNECTED_TO` redove. Migracija pre-flightom fail-closed zaustavlja postojeće cycles/duplikate; matching DB konflikti zadržavaju postojeće API greške. Aplikacijske provjere ostaju brzi pre-check, ne konačni autoritet. Implementacija ne mijenja relation authorization ni cross-boundary mutation scope.

`removeRelation` zahtijeva manage samo nad URL root assetom; ne ponavlja scope nad oba endpointa. Event se piše i na foreign endpoint. Nakon redakcije read prikaza treba eksplicitno definisati može li scoped manager mijenjati cross-boundary edge.

## 6. Licence i ugovori

License key je AES-GCM šifrovan, ne lista se niti exportuje, key ring podržava decrypt rotaciju, a reveal zahtijeva `asset.license.manage` i auditira se. Kind/target i seat compliance su jasni; over-allocation je dozvoljen ali vidljiv. Contract datumi/kind/cost su validirani i link/unlink emituje asset event.

Baseline je pokazao da je per-user license assignment prihvatao svakog aktivnog, neanonimizovanog usera po ID-u, bez provjere user OU/scopea ili kompatibilnosti sa OU licence; scoped manager je mogao vezati i u detailu vidjeti ime/e-mail foreign korisnika. W7.7 zatvorio je ovaj per-user nalaz: ciljni user mora biti unutar readerovog `asset.read` opsega i OU subtree licence, picker koristi iste granice, detail rediguje postojeće/neusklađene ciljeve, a promjena OU licence koja bi stradala postojeće dodjele se odbija. Tačan subtree kriterij i direktni PostgreSQL dokaz su u [W7.7 closeoutu](../implementation/93-assets-license-ou-scope.md). Asset assignment i dalje provjerava read scope nad assetom, ali ne zahtijeva da target pripada OU licence; cross-OU compliance semantika ostaje otvorena i nije dio `BA-assets-07` closeouta.

Baseline je license/contract create, update, delete i dio transfer/catalog putanja prvo commitovao business write, a zatim zapisivao zaseban globalni audit; audit greška mogla je ostaviti write bez audit traga, a delete izgubiti objekt prije potvrde audita. W7.12 zatvara `BA-assets-12`: zajednički Prisma transaction helper sada obuhvata postojeći audit zapis zajedno sa relevantnim katalog, license, contract, transfer, asset retire/dispose/delete i ticket link/unlink mutacijama. Kod upload-a potpisanog transfer fajla DB/audit greška briše novu kopiju, dok se stara kopija uklanja tek nakon uspješnog commita. License-key reveal ne mijenja business row i ostaje fail-closed do uspješnog audit zapisa; `setPrimary` nema postojeći globalni audit event i nije mijenjan. Import, directory sync, audit read/export i transfer anonymization/retention ostaju zasebni scopeovi.

Liste koriste hard `listMax`; assignmenti, contract itemi i asset-card licence/ugovori koriste 50/100 limite bez cursora/`hasMore`. Compliance used count može pokazati broj veći od prikazanih assignmenta bez objašnjenja.

## 7. Ticket veze

Ticket access koristi centralni ticket policy. Edit je staff-only, zahtijeva `asset.read`, odbija closed/archived/merged ticket, asset mora biti u read scopeu, a limit je 20. Link/unlink upisuju asset event i ticket system event.

Baseline nije imao DB invariant za pravilo „tačno jedan primary dok postoje linkovi“: link/set-primary rade `updateMany(false)` pa `create/update(true)`, a unlink bira oldest. Paralelni link, set-primary, split/merge ili unlink tokovi mogli su ostaviti više primarnih ili nijedan; obična Prisma transakcija to nije sprječavala. W7.8 je zatvorio `BA-assets-08` partial unique indeksom, parent-ticket row lockom, deferred provjerom tačno jednog primary reda na commit-u i fail-closed preflightom s determinističnim legacy reconciliationom. Direktni PostgreSQL dokaz i rollback SQL su u [W7.8 closeoutu](../implementation/94-assets-ticket-primary-invariant.md).

## 8. Import/export i resource granice

CSV/XLSX parser ograničava veličinu i redove, normalizuje kolone, koristi formula result umjesto izvršavanja formule, a export formula-escapuje ćelije. Preview job pripada actoru; parsed rows su kratkotrajno spremljeni u DB JSON, expire se i brišu. Apply ponovo provjerava aktuelnu permission/OU granicu, što sprječava stale preview privilege escalation.

Claim je CAS `PREVIEW -> expiresAt=now`, ali nema eksplicitno APPLYING stanje/lease. Crash poslije claima može ostaviti job formalno PREVIEW sa isteklim leaseom dok cleanup ne postavi EXPIRED; retry semantika i odgovor nisu dokazani. Velik apply i event set moraju imati jasan transaction timeout i idempotency ugovor.

Unique attribute race i opći optimistic konflikt postoje i kroz import. Parsed rows mogu sadržati serial, cost, notes i custom identifikatore; privacy klasifikacija, TTL dokaz, DB backup retention i redaction moraju biti eksplicitni. E2E ne pokriva crash nakon claima, concurrent apply niti maksimalni workbook memory profil.

## 9. Directory sync i scheduler

Planner razlikuje create/update/adopt/skip/missing, manual assignment pobjeđuje suggestion, missing računar se ne auto-retireuje, a writes koriste verziju gdje je primjenjivo. Setting i addon gate su prisutni.

Baseline single-flight `running` zaštita je bila in-memory boolean po procesu. Manualni, scheduled i višestruki worker instance runovi mogli su se preklopiti, duplirati create/adopt plan, međusobno mijenjati missing marker i proizvesti nepouzdan zbirni audit. W7.9 (`BA-assets-09`) je zatvorio ovaj nalaz Redis leaseom sa nasumičnim owner tokenom, run ID-om, PX expiryjem i compare-owner heartbeat/release skriptama. Lease koriste zajednički service put API-ja, workera i CLI-ja; neuspješan Redis arbitration/renewal prekida sync, a TTL vraća mogućnost rada nakon crasha. Nije uveden DB run-state niti je mijenjan API response shape.

U audit baselineu scheduler upsert se radio samo pri bootu. Redis restart/flush ili startup registracijska greška mogla je ostaviti sync bez posla do redeploya, bez periodičnog reconciliationa ili last-success age health gatea. W7.9 je zatvorio samo directory single-flight lease; ne mijenjao je scheduler lifecycle. W7.10 zatvorio je `BA-assets-10`: directory sync i reminders sada se eager-registruju i pokušavaju ponovo svakih pet minuta, asset upsert je ograničen timeoutom, a worker ostaje `degraded` dok schedules ne budu potvrđeni. Ops-health označava nedostajući BullMQ registration i last-success stariji od 75 minuta. Real-Redis suite uklanja i zatim vraća oba schedule zapisa; detalji i rollout/rollback su u [W7.10 closeoutu](../implementation/96-assets-scheduler-reconciliation.md).

## 10. Transferi i signed dokumenti

Transfer je funkcionalno najjači dio modula. Plan provjerava scenario/holder/status; move transaction pravi mjesečni DB-backed sequence, frozen snapshot/items i optimistic update svakog asseta. DOCX template se inspectuje/renderuje/skanira; signed PDF/image ima signature provjeru, size cap, ClamAV, random contained path i cleanup novog fajla na DB failure. Replace briše prethodnu kopiju tek nakon uspješnog updatea.

Template version se računa `latest + 1` u običnoj transakciji. Paralelni upload može dati unique konflikt umjesto uredne alokacije/retrya. Cancel koristi status CAS, što je pozitivno, ali signed fajl ostaje uz cancelled zapis; policy mora eksplicitno odlučiti retention i participant download nakon cancel-a.

Transfer snapshot trajno čuva imena, email, OU/title i asset identifikatore. User anonymization/FK `SetNull` ne rediguje frozen JSON ni signed binary. Nema vidljivog retention/erasure lifecyclea za snapshot, signed file, orphan direktorije ili template BLOB-ove. `mine` i `forAsset` su hard-limitirani bez paginationa.

## 11. Reminders, delivery i recovery

Planner je determinističan i threshold niz sprečava normalan dnevni duplicate. Primaoci se računaju po permission kindu i OU subtreeu; in-app ima dedupe key, a user email koristi centralni durable delivery helper i preference policy.

Baseline kvar BA-assets-04 bio je bezuslovni upis planiranih thresholda nakon pokušaja kanala — uključujući nula recipienta, sve preference OFF, nedostupan SMTP i uhvaćene in-app/email greške. W7.4 zatvara taj kvar: servis prati scoped primaoce, primaoce s barem jednim uključenim kanalom i potvrđenu dostavu po itemu; marker napreduje tek kad svaki takav primalac ima persisted in-app notifikaciju (uključujući stabilni dedupe pogodak) ili e-mail status `SENT`. `CLAIMED`, izuzetak, neuspješna dostava, odsustvo scoped primalaca ili svi scoped kanali OFF ostavljaju prag pending. Hash dedupe ključ je stabilan za retry istog item/type/threshold/datum isteka, a `updateMany` CAS uslov ponovo provjerava datum i izvornu listu pragova prije upisa. Dodatni interni email može zadovoljiti samo item bez scoped primaoca i samo nakon uspješnog slanja; zasebni durable status/dedupe nalaz za te adrese zatvoren je u W7.11 (`BA-assets-11`).

Baseline je dodatne interne adrese slao direktno kroz transport, bez delivery reda/statusa; crash nakon SMTP prihvata, a prije marker updatea, mogao je duplirati poruku, dok se failure samo logovao. W7.11 zatvara `BA-assets-11`: svaki recipient/batch sada ima durable `CLAIMED`/`SENT`/`FAILED` stanje, hash-only dedupe identitet, stale-claim recovery i token fencing. Setting primaoca je secret, globalno autorizovan, auditiran i redigovan u novim settings/change-log odgovorima. At-least-once retry i mogući duplikat u dvosmislenom SMTP prihvat→`SENT` crash prozoru ostaju eksplicitni; tačan ugovor, testovi i migration/rollback su u [W7.11 closeoutu](../implementation/97-assets-reminder-extra-email-delivery.md).

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
| BA-assets-06 | P2       | Parallel relation cycle/symmetric insert može prekršiti graph invariant                        | zatvoreno |
| BA-assets-07 | P2       | Per-user license assignment nema user OU/scope kompatibilnost                                 | zatvoreno |
| BA-assets-08 | P2       | Ticket primary link nema partial unique/locking invariant                                     | zatvoreno |
| BA-assets-09 | P2       | Directory single-flight lock je samo in-memory po procesu                                     | zatvoreno |
| BA-assets-10 | P2       | Directory i reminder scheduler nemaju Redis-loss reconciliation                               | zatvoreno |
| BA-assets-11 | P2       | Extra reminder email zaobilazi durable delivery i per-recipient dedupe/status             | zatvoreno |
| BA-assets-12 | P2       | License/contract/transfer i drugi business writeovi nisu atomski sa auditom                    | zatvoreno |
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
- **07:** zatvoreno u W7.7 za per-user target — korisnik mora biti u `asset.read` scopeu i OU subtree licence; kandidat-picker i detail primjenjuju iste granice, a promjena OU licence ne smije ostaviti dodjelu izvan subtreea. Asset-target cross-OU semantika ostaje izvan closurea. Detalj u [W7.7 implementacijskom dokazu](../implementation/93-assets-license-ou-scope.md).
- **11:** zatvoreno u W7.11 — hash-only unique `(recipient, batch)` delivery zapis čuva `CLAIMED`/`SENT`/`FAILED`, retries `FAILED` i claim stariji od 10 minuta te token-fencing štiti successor worker. `SENT` može dovršiti W7.4 marker retry bez ponovnog slanja; recipient setting je secret, globalno autorizovan, auditiran i redigovan. SMTP prihvat prije DB `SENT` upisa i dalje može dati at-least-once duplikat. Detalj, PostgreSQL acceptance, CI, preflight i rollback su u [W7.11 closeoutu](../implementation/97-assets-reminder-extra-email-delivery.md).
- **05–06:** normalizovane unique attribute vrijednosti i canonical relation edge/invariant uz DB constraint/locking.
- **07:** per-user license target OU/scope je zatvoren u W7.7; asset-target cross-OU semantika ostaje otvorena.
- **08:** zatvoreno u W7.8 — partial unique indeks, parent-ticket lock, deferred exact-one provjera i deterministična legacy reconciliation procedura.
- **09:** zatvoreno u W7.9 — Redis single-flight lease sa owner tokenom/run ID-om, heartbeatom, bounded Redis commandima i TTL recoveryjem; detalj u [W7.9 closeoutu](../implementation/95-assets-distributed-directory-sync-lease.md).
- **10:** ostaje otvoreno — periodični repeatable-job reconciliation nakon Redis restart/flush i last-success health gate; nije dio W7.9.
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

BA-assets-04 marker correctness za primarne scoped dostave zatvoren je u W7.4, `BA-assets-10` scheduler reconciliation i last-success signal u W7.10, a `BA-assets-11` durable status/dedupe za extra email u W7.11. `BA-assets-18` širi delivery/scheduler health nalaz ostaje otvoren i nije preuzet u W7.11.

### Faza 3 — DB invarianti i licence

Unique attribute storage, relation canonical/cycle zaštita, primary partial unique, license OU target pravilo i DB-backed template version.

### Faza 4 — import/directory i audit

W7.9 je zatvorio distributed directory run lock (`BA-assets-09`). Preostaju APPLYING lease/idempotency za import, bounded recovery i transactional/outbox audit standard.

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

Modul ima ozbiljan i funkcionalno bogat temelj, posebno u transferu, spreadsheet sigurnosti i osnovnom OU modelu. W7.1–W7.4 su zatvorili četiri početna P1 nalaza, W7.5 je uklonio race za unique custom JSON atribut, W7.6 je zatvorio directed-cycle/symmetric-edge DB race, W7.7 per-user license OU/scope nalaz, a W7.8 ticket primary-link invariant. Asset-target cross-OU semantika, drugi DB invarianti, scheduler recovery, audit i lifecycle nalazi i dalje znače da modul nije production-grade enterprise CMDB. Iskren početni baseline ostaje **4,59/10**.

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

Sedam direktnih PostgreSQL acceptance scenarija pokriva concurrent raw write, manual create/update i parallel update, stale manual-vs-import race u oba ishoda, import UPSERT update i catalog uniqueness/archive transitions. Kodni/testani SHA `c9773edb259756dc34b0dceb59522a4770b2ee7f` i finalni CI [`40942023054`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40942023054) su zeleni. Prisma validate/generate, backend build/test, migration replay i real PostgreSQL suites, frontend, docs guard, container/supply-chain i gate prošli su. Push workflow je preskočio E2E jobove; high/critical image enforcement korak je `skipped` jer je scanner count bio nula. Lokalno je Prisma engine download bio blokiran TLS-om, build nije imao generated client, a direct PostgreSQL nije bio dostupan; ciljani unit/lint/policy/harness provjerama nije utvrđen kvar. Detaljan migration/rollback plan i CI/lokalna matrica su u [91-assets-unique-custom-attribute-constraint.md](../implementation/91-assets-unique-custom-attribute-constraint.md). U tom W7.5 checkpointu nisu bili dodirnuti `BA-assets-06`–`BA-assets-19`, a sljedeći paket W7.6 (`BA-assets-06`) još nije bio započet.

## 25. Implementacijski closeout — W7.6 (`BA-assets-06`)

W7.6 zatvorio je samo `BA-assets-06` (P2). Migracija `20271027230000_asset_relation_graph_invariants` prvo radi fail-closed pre-flight za postojeće directed cycles i duple unordered `CONNECTED_TO` parove pod table lockom. Zatim instalira canonical partial unique index za `CONNECTED_TO`, transaction advisory-lock trigger za relation INSERT/UPDATE i statement-level recursive cycle guard. `AssetsService.addRelation` mapira named PostgreSQL/Prisma `P2039` cycle konflikt nazad na `ASSET_RELATION_CYCLE`, a relation unique konflikte na `ASSET_RELATION_EXISTS`; pre-checkovi i postojeći API shape ostaju.

Šest direktnih PostgreSQL acceptance scenarija pokriva dvije i tri paralelne directed veze, obrnutu `CONNECTED_TO` konkurenciju, multi-row cycle rollback, bounded app-precheck mimođen dugi cycle koji DB/API odbije te postojeću reverse-edge API grešku. Dodan je 4-test DB-conflict classifier i suite runner registracija. W7.2 scope-display fixture je zadržao oba query-smjera bez directed cyclea koristeći `CONNECTED_TO`; nije promijenjen W7.2 authorization/scope kod.

Kodna promjena je krenula na SHA `f1f7c3897b8e3bfa870cdc7e09c46fb1b022a191`; dva CI pokušaja `40947909645` i `40949108693` otkrila su fixture cycle, zatim adapter `P2039`/test-count klasifikaciju, pa su oba problema korigovana. Finalni testani SHA `d4f0a5b980d6a1527486ad97a604ff8869be7f37` i CI [`40950115033`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40950115033) su zeleni: Prisma validate/generate, backend build/lint/test, PostgreSQL+Redis migration replay/integration, frontend build/test, docs guard, container/supply-chain i CI gate prošli su. Push workflow je preskočio E2E jobove i high/critical image enforcement je `skipped` uz scanner count nula. Lokalno nije bilo PostgreSQL/Docker; ciljane unit/harness/policy/lint/format provjere su prošle, a DB dokaz dolazi iz CI-ja.

Migracija i rollback/repair procedura, pre-flight SQL, cleanup SQL i rollout redoslijed su u [92-assets-relation-graph-invariants.md](../implementation/92-assets-relation-graph-invariants.md). `BA-assets-07`–`BA-assets-19` ostali su otvoreni na W7.6 checkpointu; W7.7 je kasnije zatvorio samo `BA-assets-07`.

## 26. Implementacijski closeout — W7.7 (`BA-assets-07`)

W7.7 zatvorio je samo `BA-assets-07` (P2). OU kompatibilnost prati postojeći slash-delimited subtree model: korisnik mora biti u OU licence ili njegovom potomku, a istovremeno unutar callerovog `asset.read` opsega. License-specific user picker filtrira oba opsega; `assign()` odbija foreign ili nekompatibilan ID prije zapisa; detalj rediguje legacy/neusklađene korisničke ciljeve i vraća samo agregat `hiddenAssignmentsCount`. Promjena OU licence se odbija ako bi postojeće user dodjele ostavila izvan nove subtree granice. Asset-target cross-OU compliance napomena ostaje otvorena i nije promijenjena.

Sedam direktnih PostgreSQL scenarija pokriva picker, valjanog child-OU korisnika, sibling target rejection, out-of-read-scope 404, redakciju legacy PII, blokadu license OU premještanja i redakciju nakon user OU promjene. Feature commit je `bc7906795e83e4eb9dd25319234e33ddf4bb441d`; test/wiring correction i finalni testani SHA su `55fb782d02a4ccfecf4553c8d7fbfa9a6a41016b`. CI [`40956304026`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40956304026) je zelen za Prisma validate/generate, backend build/lint/test, PostgreSQL+Redis migration replay/integration, frontend build/test, docs guard, container/supply-chain i CI gate. Prvi CI `40955264212` otkrio je tipnu grešku u integration viewer fixtureu i nedostajući wiring snapshot; oba su ispravljena prije finalnog gatea. Push workflow je preskočio E2E jobove, a image vulnerability enforcement step je `skipped` nakon scan koraka.

Nema Prisma schema kolona ni backfill migracije. Lokalni backend Jest bio je blokiran nedostajućim generated Prisma clientom; CI je generisao client i izvršio testove. Potpuni rollout, API, testni, registry i rollback dokaz je u [93-assets-license-ou-scope.md](../implementation/93-assets-license-ou-scope.md). `BA-assets-08`–`BA-assets-19` ostali su otvoreni na W7.7 checkpointu; W7.8 je kasnije zatvorio samo `BA-assets-08`.

## 27. Implementacijski closeout — W7.8 (`BA-assets-08`)

W7.8 zatvorio je samo `BA-assets-08` (P2). Migracija `20271028000000_asset_ticket_primary_invariant` radi fail-closed preflight pod `TicketAsset` table lockom; zatim dodaje partial unique indeks za najviše jedan `isPrimary=true`, `BEFORE` trigger koji serijalizuje promjene parent `Ticket` redom, te deferred constraint trigger koji na commit-u zahtijeva tačno jedan primary dok god postoje linkovi. Aplikacijski lock se uzima prije čitanja skupa linkova u link/unlink/set-primary tokovima i prije kopiranja veza pri merge/split operacijama. Deterministični fallback koristi najstariji `linkedAt`, zatim `assetId`.

Osam direktnih PostgreSQL acceptance scenarija pokriva odbijanje linka bez primary reda, partial-unique odbijanje duplog primaryja, validnu atomic primary promjenu i rollback invalidnog stanja, paralelne application linkove, konkurentne direktne DB primary inserte, `setPrimary`/unlink fallback, merge/split copy uz postojeći primary i Ticket cascade delete. Suite je dodat u izolovani integration runner. Demo-seed create/remove tokovi su prilagođeni novom invariant-u; nijedna HTTP ruta ni scope/authorization semantika nisu mijenjane.

Implementacijski commit je `f9a90ba057b612451a5f4868947ce32a0e73ef43`; zeleni CI [`40962089973`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40962089973) na istom SHA-u pokrio je Prisma validate/generate, backend build/lint/test, PostgreSQL+Redis migracijski replay i real suites, frontend, docs guard, container/supply-chain i CI gate. Lokalno su prošli backend lint (0 grešaka; tri postojeća `no-explicit-any` upozorenja u nepovezanom SLA specu), wiring check i testovi (614 ruta; 6/6), migration policy za 98 migracija i testovi 2/2, integration harness 3/3, te `git diff --check`. Lokalni Jest nije pokretan jer sandbox nema generated Prisma client; CI ga je generisao i izvršio backend suite. Push trigger je preskočio E2E jobove; image vulnerability enforcement korak je `skipped` jer je scanner actionable count bio 0. Nije bilo neuspjelog W7.8 CI pokušaja.

Nema schema kolone niti backfill-a. Migracija odbija deployment ako preflight nađe ticket bez tačno jednog primary reda; ne prepravlja tiho stare podatke. [W7.8 closeout](../implementation/94-assets-ticket-primary-invariant.md) sadrži preflight, deterministični repair SQL, rollout, failed-migration recovery i rollback. Aplikacijski rollback ostavlja DB guardove; uklanjanje nakon uspješno primijenjene migracije ide isključivo kroz zasebnu forward cleanup migraciju. Eventualna pre-deploy reconciliation ostaje validna i ne vraća se na poznato neispravno stanje.

Na tadašnjem W7.8 checkpointu `BA-assets-09`–`BA-assets-19` su ostali otvoreni, a W7.9 još nije bio započet; kasniji W7.9 closeout je u odjeljku 28.

## 28. Implementacijski closeout — W7.9 (`BA-assets-09`)

W7.9 zatvorio je samo `BA-assets-09` (P2): `AssetDirectorySyncService` sada koristi zajednički Redis single-flight lease za API/manual, worker/scheduled i CLI runove. Lease ključ `assets:directory-sync:full-run` sadrži `runId` i nasumični `ownerToken`, počinje atomarnim `SET NX PX` (TTL 120 s), obnavlja se svakih 30 s, a compare-owner Lua skripte štite renewal/release. Redis komande imaju timeout 2 s; outage, lease expiry/ownership loss ili neuspješan heartbeat fail-closed. Service provjerava lease oko LDAP/planning/report/audit faza i tokom apply; ownership error se nikad ne broji kao običan neuspjeh asseta. `runId` se čuva u audit metadata/logovima. Nema DB schema promjene niti migracije. `BA-assets-10` scheduler reconciliation ostaje zasebno otvoren.

Service/unit testovi dokazuju cross-instance contention i release, fail-closed Redis outage, lease loss nakon LDAP i propagation gubitka leasea iz update transakcije. Real-Redis integration suite sa dva nezavisna klijenta pokriva atomic contention, renewal duži od početnog TTL-a i recovery nakon crash/expiry; suite je u isolated integration runneru. Kodni commit je `0f2e3d3bec3fffb828a651038a571e349352fb3b`, a testni tip/korekcija `2f53edc1de07669f32fb9e1254ee0916eb584d64` je finalni testani SHA. Prvi CI `41009478021` pao je zbog našeg literal-type/mocked-Redis test fixture problema, koji je ispravljen. Zeleni CI [`41010129252`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41010129252) pokrio je backend build/lint/Jest, PostgreSQL+Redis acceptance, frontend, docs guard, container/supply-chain i gate. E2E jobovi su preskočeni na pushu; image vulnerability enforcement je `skipped` jer je scanner actionable count bio 0. Potpuni testni, rollout, rollback i lokalni limit dokaz je u [95-assets-distributed-directory-sync-lease.md](../implementation/95-assets-distributed-directory-sync-lease.md).

## 29. Implementacijski closeout — W7.10 (`BA-assets-10`)

W7.10 zatvorio je samo `BA-assets-10` (P2). Directory sync i asset reminder scheduleri sada ponovo upsertuju BullMQ repeatable schedule zapise nakon Redis gubitka ili prolazne greške pri startup registraciji. Upsert je timeout-ograničen na pet sekundi; worker reconciler armira petominutni retry prije eager pass-a, ne prekida bootstrap zbog greške i zadržava lifecycle kao `degraded` dok schedules ne budu zdravi. Početni worker lifecycle publish je best-effort tokom Redis reconnecta kako bi reconciliation i keepalive timeri ostali aktivni.

Ops-health očekuje oba scheduler ID-a i prikazuje missing registration kao `registered=false`; inspection timeout ostaje unknown, ne missing. Posljednji uspjeh se provjerava prema 75-minutnom pragu za hourly cron poslove, uz postojeći `scheduler.late` alarm. Real-Redis acceptance suite briše tačno ta dva scheduler zapisa u izolovanom prefixu i dokazuje ponovnu registraciju; unit/integration testovi pokrivaju startup error/timeout, retry, schedule konfiguraciju, readiness i UI/API alarm signal.

Finalni testani SHA je `ccbceb1179b37fae2cce243c066deb3ed4fab489`; zeleni CI [`41020243134`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41020243134) je prošao backend build/lint/Jest, PostgreSQL+Redis integration, frontend lint/format/test/build, docs guard, container/supply-chain i CI gate. Nije bilo neuspjelog W7.10 CI pokušaja. Push workflow je preskočio E2E jobove; image vulnerability enforcement je `skipped` uz actionable count nula. Lokalni backend runner test bio je blokiran neinstaliranim `pg` paketom (`backend/node_modules` ne postoji), dok su potpuni CI suiteovi prošli. Nema Prisma promjene, DB migracije ni DB rollback koraka. Operativni rollout/rollback dokaz je u [96-assets-scheduler-reconciliation.md](../implementation/96-assets-scheduler-reconciliation.md).

Na W7.10 checkpointu `BA-assets-11`–`BA-assets-19` ostali su otvoreni; W7.11 je kasnije zatvorio samo `BA-assets-11`.

## 30. Implementacijski closeout — W7.11 (`BA-assets-11`)

W7.11 zatvara samo `BA-assets-11` (P2). `AssetReminderEmailDelivery` je nova aditivna tabela sa SHA-256 hashom normalizovane adrese, batch fingerprint ključem, statusima `CLAIMED`/`SENT`/`FAILED`, brojem pokušaja, UUID claim tokenom i vremenskim oznakama. Unique `(recipientHash, dedupeKey)` garantuje jedan claim po recipient/batch identitetu; DB provjere ograničavaju statuse, broj pokušaja i vezu između statusa i claim tokena. Tabela ne čuva raw adresu ni poruku. Opcionalni setting `private.assets.reminders.recipients` sada je secret i njegovi novi registry/change-log prikazi su redigovani; `settings.write` zahtijeva globalni grant, a promjena zahtijeva audit reason.

Helper koristi unique insert i atomarni `updateMany` CAS, retry za `FAILED` i `CLAIMED` stariji od 10 minuta te token-fencing za svakog statusnog updatea. Servis potvrđuje trajni `SENT` prije brojanja novog slanja, a raniji `SENT` dovršava marker retry bez novog SMTP poziva. Duple adrese se normalizuju prije slanja. Postojeći internal-only i puni installation-wide sadržaj, scoped-user delivery i W7.4 pravilo da extra uspjeh zadovoljava prag samo bez scoped primaoca ostaju nepromijenjeni. SMTP prihvat prije `SENT` upisa zadržava dvosmislen at-least-once prozor; stale recovery može tada poslati ponovo.

Direktni unit i service regression testovi pokrivaju hash/normalizaciju, dedupe, `FAILED` retry, stale/live claim, unique-key race, token fencing, `SENT` marker retry, status nakon SMTP greške i log redaction. Novi PostgreSQL acceptance suite, registrovan u isolated runneru, dokazuje da konkurentni pokušaji daju jednog vlasnika, retry iz `FAILED`/stale `CLAIMED` povećava attempts, `SENT` sprečava resend, a prethodni token ne mijenja successor red. Settings testovi pokrivaju globalnu authorization granicu i redaction u registry/change logu.

Implementacijski commit je `4c1be0af4c90d001d4adff29529c8c111a8f53ec`; tipni popravak `b7d0ae64200c8739e6dd55976828b1b63928b545` je finalni testani SHA. CI `41025218482` prvi je pao na helper tipu u integration testu jer direktni Prisma client nema Nest lifecycle hookove; suženje tipa na potreban delivery delegate otklonilo je grešku. Zeleni CI [`41025718081`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41025718081) na finalnom SHA prošao je Prisma validate/generate, backend build/lint/Jest, PostgreSQL+Redis replay i integration suiteove, frontend, docs guard, container/supply-chain i CI gate. E2E push jobovi su preskočeni; image vulnerability enforcement je `skipped` uz actionable high/critical count nula. Lokalno su prošli migration policy (99 migracija; testovi 2/2), integration-runner syntax check i `git diff --check`; lokalni backend suite nije se mogao pokrenuti bez `backend/node_modules` i generated Prisma clienta.

Migracija `20271028100000_asset_reminder_extra_email_delivery` transakcijski označava postojeći settings red `PRIVATE/isSecret=true` i kreira praznu delivery tabelu/indekse/constraints; nema delivery backfilla ni legacy statusa za reconciliation. Release preflight provjerava prethodnu migraciju, odsustvo ručno kreirane tabele i optional settings red; detalji su u [W7.11 closeoutu](../implementation/97-assets-reminder-extra-email-delivery.md). Ranije uspješno primijenjene migracije se ne ponavljaju. Ako nova migracija ne uspije, `migrate resolve --rolled-back` važi samo za njen failed pokušaj. Nakon uspješnog applya tabela se ne dropuje ručno; cleanup je zasebna forward-only migracija. Povratak na pre-W7.11 kod bi uklonio redaction klasifikaciju i zato nije preporučen bez zadržavanja te korekcije.

Po W7.11 zatvoren je samo `BA-assets-11`; `BA-assets-12`–`BA-assets-19`, uključujući `BA-assets-18`, ostaju otvoreni. Deklarisani zbir je 578 otvorenih / 114 zatvorenih / 692 ukupno; machine-readable source plan je 581 otvoren / 100 zatvorenih / 11 historijskih. Preegzistentna razlika od tri statusa ostaje izvan ovog paketa. Sljedeći planirani paket je W7.12 (`BA-assets-12`), ali nije započet.

## 31. Implementacijski closeout — W7.12 (`BA-assets-12`)

W7.12 zatvara samo `BA-assets-12` (P2). Zajednički `withAssetAuditTransaction` obuhvata relevantni asset business write i njegov postojeći globalni audit entry u istom Prisma transaction-u. Integrisan je u catalog type/attribute/location, license create/update/delete/assign/release, contract create/update/delete/item add/remove, transfer issue/cancel/signed-file upload, signatory/template izmjene, core asset retire/dispose/delete i ticket link/unlink tokove. `assetLocationSaved` metadata allowlist je podignut na schema v2 za postojeća `created`/`archived` polja. License-key reveal i dalje čeka fail-closed audit prije vraćanja plaintexta; `setPrimary` nema postojeći globalni audit poziv. Audit read/export, import i directory sync nisu obuhvaćeni.

Signed-transfer upload sada kompenzuje DB ili audit grešku brisanjem novog fajla, a prethodni fajl uklanja tek nakon uspješnog commita. Unit testovi pokrivaju helper rollback i transfer audit failure/filesystem redoslijed; novi real-PostgreSQL suite dokazuje katalog create+audit atomicnost i rollback nakon audit policy odbijanja. Suite je uključen u isolated runner.

Kodni commit i finalni testani SHA su `2917363eea13a58be6f76850aa39ccc6c2e655c2`; zeleni CI [`41030516609`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41030516609) prošao je Prisma validate/generate, backend build/lint/Jest, PostgreSQL+Redis migration replay/integration, frontend, docs guard, container/supply-chain i CI gate. E2E push jobovi su preskočeni; image vulnerability enforcement korak je `skipped` uz actionable high/critical count nula. Nije bilo neuspjelog CI pokušaja. Lokalni Prisma generate/testovi koji zahtijevaju generated client bili su blokirani sandbox TLS pristupom `binaries.prisma.sh`; puni CI je uspješno generisao klijent i izvršio suiteove. Migration policy provjera je obuhvatila 99 postojećih migracija; W7.12 ne dodaje migraciju.

Po W7.12 zatvoren je samo `BA-assets-12`; `BA-assets-13`–`BA-assets-19`, uključujući `BA-assets-18`, ostaju otvoreni. Deklarisani zbir je 577 otvorenih / 115 zatvorenih / 692 ukupno; machine-readable source plan je 580 otvorenih / 101 zatvoren / 11 historijskih, uz istu preegzistentnu razliku od tri statusa. Potpuni scope, testni dokaz, CI, registry i rollout/rollback obrazloženje je u [W7.12 closeoutu](../implementation/98-assets-transactional-business-audit.md). Sljedeći planirani paket je W7.13 (`BA-assets-13`) import recovery.
