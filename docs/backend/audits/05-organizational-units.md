# Backend audit 05 — organizational-units

**Status:** audit završen  
**Datum:** 2026-10-22  
**Modul:** `backend/src/modules/organizational-units`  
**Baseline ocjena:** **6,71/10**  
**Nalazi:** 2 P1, 5 P2, 2 P3, 8 pozitivnih zapažanja  
**Implementacija:** nije započeta; korekcije čekaju završetak kompletnog backend audita

## 1. Executive summary

Modul ima dobro razloženu domensku logiku za hijerarhiju: normalizuje ime i DN, provjerava parent/DN odnos, blokira cikluse, transakcijski prepisuje putanje potomaka i zajedno s mutacijom piše audit. Delete prije brisanja provjerava širok skup zavisnosti, dijeli advisory lock sa invariantom posljednjeg SuperAdmina i upozorava kada cascade uklanja scoped role assignmente. DTO granice za ime, DN i opcionalne atribute su uglavnom eksplicitne.

Najveći problem je authorization granica. Sve mutacije i detaljni readovi zahtijevaju samo role key `ADMIN`; ne provjeravaju OU permission niti scope aktera. Scoped ADMIN zato može globalno kreirati, premjestiti, preimenovati i brisati OU-ove, mapirati bilo kojeg korisnika — uključujući mete iz drugog OU-a — i cascade ukloniti role assignmente izvan vlastitog scopea. Ovo je isti sistemski obrazac kao `BA-users-01`, ali sa dodatnim uticajem na samu authorization topologiju.

Drugi P1 je distribuirana zastarjelost authorization kataloga. `ouPath` je sigurnosno relevantan za descendant scope odluke, a rename/reparent mijenja putanje cijelog podstabla. Mutacija invalidira samo in-process `WeakMap`; druge instance mogu do 60 sekundi koristiti stare putanje. Premještanje podstabla iz OU A u OU B zato može privremeno ostaviti pristup akteru scoped na A.

Hijerarhijske provjere i skup potomaka čitaju se prije write transakcije bez revision/lock ugovora. Konkurentni rename/reparent može izgubiti izmjenu ili ostaviti parent, `ouPath` i DN izvedene iz različitih snapshotova. Case-insensitive DN identitet provjerava se aplikacijski, ali DB unique je case-sensitive, pa konkurentni case-varijantni inserti mogu oba uspjeti.

## 2. Scope i inventar

| Metrika                    |                                              Vrijednost |
| -------------------------- | ------------------------------------------------------: |
| TypeScript fajlovi         |                                                      54 |
| Produkcijski fajlovi       |                                                      43 |
| Spec fajlovi               |                                                      11 |
| Produkcijske linije        |                                                   1.987 |
| Kontroleri                 |                                                       1 |
| Servisi                    |                                                       1 |
| Direktne module zavisnosti | `authentication`, `authorization`, `audit-log`, `users` |

Pregledane povezane površine:

- Prisma `OrganizationalUnit` i sve direktne OU relacije;
- `User.organizationalUnitId`, `UserRole.organizationalUnitId` i SuperAdmin invariant;
- authorization scope loader/evaluator i 60-sekundni scope catalog cache;
- directory-sync materialization/manual catalog delete;
- policy-pack target invalidacija;
- groups/users administracijski tokovi;
- E2E 07, 10, 38, 41, 42 i 44 te svih 11 direktnih spec fajlova.

## 3. Arhitektura i lifecycle

### 3.1. Create

1. Ime, DN i opcionalni atributi se normalizuju.
2. Parent se učitava i DN mora biti potomak parent DN-a.
3. `ouPath` se izvodi iz parent patha i imena.
4. Aplikacijska provjera traži case-insensitive DN ili identičan path konflikt.
5. OU i audit zapis commitaju u istoj transakciji.
6. Lokalni scope cache se invalidira nakon commita.

### 3.2. Rename/reparent/update

- trenutno stanje, parent graph, novi parent, svi potomci i konflikti čitaju se prije write transakcije;
- potomci se određuju preko `ouPath startsWith currentPath/`;
- novi path i DN svakog potomka računaju se u memoriji;
- root i potomci se ažuriraju sekvencijalnim `UPDATE` pozivima u jednoj transakciji;
- audit bilježi promijenjena root polja i samo broj pogođenih potomaka;
- nema hierarchy revisiona, row/advisory locka ni ponovne provjere snapshotova unutar transakcije.

### 3.3. User mapping

`PUT /organizational-units/user-mappings` direktno mijenja korisnikov home OU, u istoj transakciji piše `user.updated` audit, zatim best-effort invalidira principal context. Ne provjerava target hijerarhiju, directory ownership, source/destination scope niti vlastito premještanje. Home OU utiče na policy-pack nasljeđivanje i authorization kontekst.

### 3.4. Delete

Delete pod SuperAdmin advisory lockom:

- učitava OU;
- paralelno broji djecu, mapirane korisnike, grupe, assete, promjene, knowledge sadržaj, probleme, routing/SLA/report resurse i tikete;
- blokira brisanje kada postoje navedene zavisnosti;
- blokira cascade koji bi uklonio posljednji aktivni SuperAdmin assignment;
- čita pogođene `UserRole` redove, briše OU i auditira operaciju u istoj transakciji;
- DB cascade uklanja scoped role assignmente, a API vraća warning;
- poslije commita best-effort invalidira pogođene principale.

## 4. API/guard/scope matrica

| Ruta                                      | Guard/role                    | Scope kontrola                                | Podaci/efekat                                               |
| ----------------------------------------- | ----------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `GET /organizational-units/tree`          | session + USER/AGENT/ADMIN/SA | nema; globalno stablo                         | vraća DN, path, company, department i parent za sve OU-ove  |
| `POST /organizational-units`              | session + ADMIN/SA            | nema parent/destination provjere              | kreira OU bilo gdje                                         |
| `GET /organizational-units/:id`           | session + ADMIN/SA            | nema                                          | OU, direktna djeca i svi direktno mapirani useri s e-mailom |
| `GET /organizational-units/:id/users`     | session + ADMIN/SA            | nema                                          | globalni user-directory segment                             |
| `PATCH /organizational-units/:id`         | session + ADMIN/SA            | nema source/destination provjere              | rename/reparent i rewrite podstabla                         |
| `DELETE /organizational-units/:id`        | session + ADMIN/SA            | nema                                          | briše OU i cascade role assignmente                         |
| `PUT /organizational-units/user-mappings` | session + ADMIN/SA            | nema actor/target/source/destination provjere | premješta bilo kojeg usera ili ga odvaja od OU-a            |

Class-level `RequireRoles(ADMIN)` radi kao role-key provjera; nema `RequirePermissions`, `OuAccessGuard`, resource resolver ni SuperAdmin-only ograničenje za promjenu authorization topologije.

## 5. Podaci, transakcije i concurrency

- `distinguishedName` i `ouPath` imaju DB unique ograničenja.
- DN semantika u aplikaciji je case-insensitive, ali PostgreSQL `String @unique` je uobičajeno case-sensitive.
- Parent FK je `Restrict`; ciklus se sprečava samo aplikacijskom graph provjerom.
- User home-OU FK je `Restrict`, dok je scoped `UserRole` OU FK `Cascade`.
- Create/update/delete domen zapis i audit su atomski.
- Delete dijeli lock sa role/deactivation/delete SuperAdmin tokovima.
- Hierarchy update nema zajednički lock sa drugim create/update/reparent/directory-sync operacijama.
- Descendant rewrite izvodi N pojedinačnih updatea; velika podstabla produžavaju transakciju i lock vrijeme.
- Delete blocker countovi i role-assignment snapshot nastaju pod default isolationom bez eksplicitnog hierarchy/resource lock ugovora.
- Principal invalidacija i scope-cache invalidacija nisu durable dio commita.

## 6. Identity-provider i DN analiza

Parser prihvata jednostavne comma-separated RDN segmente sa ograničenim attribute-type katalogom. Ne implementira RFC 4514 escaping:

- `split(',')` ne razlikuje escaped zarez;
- nema parsera za quoted/escaped vrijednosti, hex escape ni multi-valued RDN;
- DN rewrite koristi string suffix;
- case se čuva, dok se duplicate precheck poredi lower-case;
- API DN limit je 1.024 znaka, ali prepisani descendant DN se ponovo ne validira prema istom limitu.

Ovo može biti dovoljno za trenutno generisane jednostavne fixturee, ali nije neutralno prema realnim Entra/AD/LDAP DN-ovima. Directory-sync modul direktno materijalizuje povezane podatke i mora dijeliti isti kanonski DN ugovor; konačni provider zaključak dodatno se provjerava u modulu 35.

## 7. Privilege-escalation analiza

### Horizontalna eskalacija

Scoped ADMIN iz OU A može:

- čitati user e-mailove OU B;
- kreirati dijete u OU B;
- premjestiti/preimenovati OU B ili ga premjestiti pod A;
- mapirati korisnika B u A, izvan OU-a ili u treći scope;
- obrisati prazan OU B i cascade ukloniti njegove role assignmente.

Nema razlike između globalnog i scoped ADMIN assignmenta na ovim rutama.

### Vertikalna i topološka eskalacija

Direktan grant `SUPER_ADMIN` ne postoji u ovom modulu, a posljednji SuperAdmin assignment je zaštićen pri deleteu. Ipak, promjena OU topologije mijenja značenje postojećih descendant-scoped grantova bez role mutation audita. Neovlašteni ADMIN može premjestiti resursno podstablo pod svoj scope ili korisnika u OU čiji policy pack/administrativni tok nije predviđen za njega. Stari scope cache na drugoj instanci produžava prethodna prava nakon legitimnog premještanja.

## 8. Testovi i izvršeni gateovi

### 8.1. Postojeći dokazi

Jedanaest spec fajlova pokriva:

- DN normalizaciju;
- create/update/reparent i kružnu hijerarhiju;
- provider-independence in-memory adapter;
- user mapping;
- delete blockere i error mapiranje;
- posljednjeg SuperAdmina;
- controller guard metadata.

E2E 38 kreira i briše OU A/B kao SuperAdmin i detaljno testira scoped pristup grupama. Ne pokušava OU create/update/delete/mapping kao scoped ADMIN. Drugi E2E testovi tree endpoint uglavnom koriste kao prerequisite; nema multi-instance cache, concurrent reparent ili real-DN compatibility testa.

### 8.2. Lokalni rezultat

```bash
npx jest --runInBand src/modules/organizational-units
```

Rezultat:

- **11 suiteova otkriveno**;
- **3 suitea prošla**;
- **19/19 izvršenih testova prošlo**;
- **8 suiteova nisu kompajlirana** zbog nedostajućeg generated Prisma klijenta/enuma i posljedičnih `PrismaService` type grešaka.

Ovo nije zeleni gate. Blokada je isti checkout reproducibility problem evidentiran u modulima 01–04.

## 9. Pozitivni nalazi

1. Create/update/delete domenska promjena i audit zapis commitaju zajedno.
2. Parent DN, self-parent i ciklična hijerarhija imaju eksplicitne domenske greške.
3. Rename/reparent transakcijski prepisuje path i DN cijelog pronađenog podstabla.
4. DB unique ograničenja štite tačan DN i path duplikat.
5. Delete ima širok, strukturiran blocker izvještaj umjesto slijepog cascade brisanja poslovnih resursa.
6. Posljednji aktivni lokalni SuperAdmin assignment je zaštićen zajedničkim advisory lockom.
7. Cascade role removal vraća warning i auditira broj/pogođene user ID-eve.
8. DTO ima whitelist/forbid režim te razumne limite za ime, DN i opcionalne atribute.

## 10. Registar nalaza

| ID                         | Severity | Naslov                                                                               | Status   | Veličina |
| -------------------------- | -------- | ------------------------------------------------------------------------------------ | -------- | -------- |
| BA-organizational-units-01 | P1       | OU control plane ignoriše actor OU/service scope i target hijerarhiju                | otvoreno | L        |
| BA-organizational-units-02 | P1       | Cross-instance stale `ouPath` cache privremeno zadržava pogrešan authorization scope | otvoreno | L        |
| BA-organizational-units-03 | P2       | Konkurentni hierarchy updatei nisu serijalizovani niti revision-guarded              | otvoreno | L        |
| BA-organizational-units-04 | P2       | Case-insensitive DN identitet nije enforcean u bazi                                  | otvoreno | M        |
| BA-organizational-units-05 | P2       | Principal invalidacija nakon mapping/deletea je optional i best effort               | otvoreno | M        |
| BA-organizational-units-06 | P2       | Globalni tree read izlaže internu LDAP/topološku metadata svim korisnicima           | otvoreno | M        |
| BA-organizational-units-07 | P2       | DN parser/rewrite ne podržava realni RFC 4514 skup                                   | otvoreno | M        |
| BA-organizational-units-08 | P3       | Tree/detail/user read i descendant rewrite nemaju operativne granice                 | otvoreno | M        |
| BA-organizational-units-09 | P3       | No-op PATCH piše update i audit bez stvarne promjene                                 | otvoreno | S        |

## 11. Detaljni nalazi

### BA-organizational-units-01 — Scope-blind OU control plane

- **Dokaz:** controller koristi samo `SessionAuthenticationGuard`, `RoleGuard` i `RequireRoles(ADMIN)`. Niti jedna ruta ne učitava actor scope; mapping ne provjerava target user hijerarhiju; update ne provjerava source i destination parent scope.
- **Uticaj:** scoped ADMIN dobija globalnu kontrolu nad OU topologijom, user home-OU mappingom i cascade role assignmentima. To je horizontalna eskalacija i indirektna promjena značenja autorizacijskih grantova.
- **Korekcija:** eksplicitni OU manage permission i resource resolver; provjeriti source i destination podstablo; user mapping mora provjeriti actor→target hijerarhiju i oba OU scopea; topološke globalne operacije po potrebi ograničiti na SuperAdmin.
- **Acceptance:** OU A/B E2E potvrđuje da scoped ADMIN ne može čitati detalj/user PII niti mutirati B, premjestiti B pod A ili mapirati B korisnika; SuperAdmin bypass je request-auditiran.
- **Owner:** organizational-units + authorization/users owner.
- **Veza:** isti sistemski uzrok kao `BA-users-01`.

### BA-organizational-units-02 — Lokalna invalidacija sigurnosno relevantnog path kataloga

- **Dokaz:** `ouPath` određuje descendant scope. Mutacije zovu globalnu funkciju koja resetuje samo memorijski `WeakMap` trenutnog procesa; druge instance zadržavaju katalog do `SCOPE_CACHE_OU_TTL_MS`, default 60 s.
- **Scenarij:** podstablo se premjesti iz A u B. Instanca koja nije obradila write i dalje vidi stari `/A/...` path i odobrava A-scoped akteru pristup resursu sada u B.
- **Uticaj:** privremeni cross-OU unauthorized access nakon sigurnosno relevantne topološke promjene.
- **Korekcija:** distribuirani OU revision/event; odluka mora porediti revision ili koristiti cache sa cross-instance pub/sub invalidacijom i fail-closed ponašanjem za kritične move/delete operacije.
- **Acceptance:** dvije instance sa zagrijanim cacheom; nakon reparenta nijedna ne dozvoljava stari scope na prvom narednom zahtjevu, uključujući event-delivery fault.
- **Owner:** authorization/platform + organizational-units owner.

### BA-organizational-units-03 — Stale-snapshot hierarchy rewrite

- **Dokaz:** current, parent graph, potomci i konflikti čitaju se prije `$transaction`; transakcija ne zaključava hijerarhiju niti potvrđuje `updatedAt`/revision. Potomci se zatim slijepo updateuju iz ranijeg snapshot-a.
- **Scenarij:** dva requesta istovremeno reparentuju ancestor i descendant ili preimenuju isti ancestor. Oba prođu cycle/conflict provjere; kasniji write može vratiti path/DN iz prvog snapshot-a uz parent iz drugog toka.
- **Uticaj:** izgubljena izmjena, parent/path/DN nekonzistentnost i pogrešne authorization descendant odluke.
- **Korekcija:** hierarchy-wide advisory/revision lock ili serializable/CAS protokol; sve provjere i descendant snapshot ponoviti u transakciji; detektovati stale revision umjesto overwritea.
- **Acceptance:** matrica paralelnih ancestor/descendant rename/reparent operacija završava jednim validnim ishodom i eksplicitnim stale konfliktom za drugi.
- **Owner:** organizational-units/data owner.

### BA-organizational-units-04 — DN case identitet zavisi od racea

- **Dokaz:** precheck koristi Prisma `mode: insensitive`, ali schema ima obični case-sensitive `@unique`. Precheck je izvan write transakcije.
- **Scenarij:** paralelno kreiranje `OU=Sales,DC=local` i `ou=sales,dc=local` oba vidi slobodan identitet i oba se upisuju jer DB stringovi nisu isti.
- **Uticaj:** dva semantički ista directory identiteta, nedeterministički sync/link i konflikt pri kasnijoj normalizaciji.
- **Korekcija:** DB-enforced kanonski DN key/hash ili PostgreSQL lower-expression unique index/citext, uz migracijski collision report.
- **Acceptance:** case-varijantni konkurentni create/update ostavlja tačno jedan kanonski identitet i stabilnu domensku conflict grešku.
- **Owner:** organizational-units/directory/data owner.

### BA-organizational-units-05 — Principal invalidacija nije pouzdana

- **Dokaz:** invalidator u servisu je `@Optional`; mapping i delete ga zovu poslije commita u `try/catch` koji guta grešku. Nema retry/outboxa.
- **Uticaj:** korisnik nakon OU mappinga može do TTL-a zadržati stari home-OU/policy/authz kontekst; cascade role revoke nakon deletea može privremeno ostati efektivan.
- **Korekcija:** obavezan produkcijski invalidator, durable outbox/retry i DB revision provjera na zahtjevu.
- **Acceptance:** cache/Redis fault nakon mappinga ili deletea ne ostavlja stari grant/policy efektivnim.
- **Owner:** organizational-units + authorization/platform owner.
- **Veza:** specijalizacija `BA-authorization-01`.

### BA-organizational-units-06 — Preširok tree response

- **Dokaz:** `GET /tree` je dostupan USER ulozi i vraća puni `OrganizationalUnitResponse`: DN, `ouPath`, company, department, parent i timestampove za cijelu organizaciju.
- **Uticaj:** svaki autentifikovani račun dobija LDAP naming/topology i organizacijsku metadata koja nije nužna za običan OU selector; kompromitovani low-privilege račun lakše mapira infrastrukturu.
- **Korekcija:** javni minimalni tree DTO (`id`, display label i potrebna parent struktura), actor-visible filtriranje gdje poslovni tok dopušta, a puni DN/admin detalji na privilegovanoj ruti.
- **Acceptance:** USER tree response ne sadrži DN/internal path/department metadata i ne uključuje nedostupne grane prema dogovorenoj politici.
- **Owner:** organizational-units/security owner.

### BA-organizational-units-07 — DN ugovor nije provider-neutralan

- **Dokaz:** parser radi `split(',')`, rewrite radi string suffix, nema escaped separators/multi-valued RDN/hex pravila, a descendant rewrite ne ponavlja length validaciju.
- **Uticaj:** validan realni LDAP DN može biti odbijen ili pogrešno rastavljen; rename može proizvesti vrijednost izvan API ugovora; manual i synced katalog mogu imati različitu semantiku.
- **Korekcija:** standardni RFC 4514 parser/serializer i jedan canonical comparison key za manual/sync tokove; eksplicitno dokumentovati podržani subset ako puna podrška nije cilj.
- **Acceptance:** fixturei sa escaped comma/plus/backslash, Unicode, case varijantama i maksimalnim descendant rewriteom prolaze deterministički ili dobijaju dokumentovanu provider grešku.
- **Owner:** organizational-units + directory-sync owner.

### BA-organizational-units-08 — Neograničeni read/rewrite trošak

- **Dokaz:** tree učitava cijelu tabelu i rekurzivno je sastavlja; detail i list-users vraćaju sve direktne korisnike; update učitava sve potomke i izvršava jedan UPDATE po potomku. Nema depth/node/user limita ni paginacije.
- **Uticaj:** velika ili zlonamjerno duboka hijerarhija povećava memory/stack rizik, response veličinu i trajanje write transakcije/lockova.
- **Korekcija:** dokumentovani hierarchy limiti, paginacija user liste, minimalni/lazy tree model i set-based/batched subtree rewrite sa budžetom.
- **Acceptance:** maksimalno podržano stablo i veliki OU imaju izmjerene latency/response/transaction granice; zahtjev iznad limita kontrolisano pada.
- **Owner:** organizational-units/platform owner.

### BA-organizational-units-09 — No-op audit šum

- **Dokaz:** update uvijek izvršava root `update` i piše `organizationalUnit.updated`, čak i kada je `changedFields` prazan; metadata tada sadrži prazne before/after objekte.
- **Uticaj:** nepotrebno mijenja `updatedAt`, invalidira cache i stvara audit zapis koji izgleda kao promjena bez sadržaja.
- **Korekcija:** eksplicitno vratiti postojeći detalj bez writea/audita ili auditirati zasebnu idempotentnu/no-op odluku samo ako je to compliance zahtjev.
- **Acceptance:** identičan PATCH ne mijenja `updatedAt`, ne piše change audit i ne invalidira katalog.
- **Owner:** organizational-units owner.

## 12. Baseline score

| Presjek                  |   Težina | Ocjena | Ponderisano | Obrazloženje                                                                     |
| ------------------------ | -------: | -----: | ----------: | -------------------------------------------------------------------------------- |
| Arhitektura              |      10% |   7,70 |        0,77 | dobro razloženi helperi; distribuirani lifecycle nije zatvoren                   |
| API i ugovori            |      12% |   7,20 |        0,86 | dobri DTO limiti; preširok tree i bez paging/depth ugovora                       |
| AuthN/AuthZ/scope        |      15% |   5,10 |        0,77 | role guard postoji; globalni scoped-ADMIN control plane i stale scope            |
| Poslovna pravila         |      13% |   8,00 |        1,04 | jaka hijerarhijska pravila i delete blockeri; target pravila nedostaju           |
| Podaci i transakcije     |      13% |   6,60 |        0,86 | atomic audit i unique osnova; race/CAS/case problem                              |
| Sigurnost i privatnost   |      12% |   6,20 |        0,74 | topologija i DN metadata preširoki; scope prozor visokog uticaja                 |
| Async/integracije        |       8% |   6,10 |        0,49 | sync integracije invalidiraju lokalno; nema distribuiranog/durable signala       |
| Testovi                  |      10% |   7,00 |        0,70 | dobra helper pokrivenost; nema ključnih scope/concurrency/multi-instance testova |
| Operativnost/performance |       7% |   6,90 |        0,48 | strukturirani blocker warning; neograničeni tree/rewrite i audit šum             |
| **Ukupno**               | **100%** |        | **6,71/10** | dva P1 nalaza ograničavaju baseline                                              |

Ocjena **6,71/10** je direktni ponderisani rezultat bez kvalitativnog ili ručnog podizanja. Jake hijerarhijske primitive i transakcijski audit već su uračunati u odgovarajuće presjeke; dva P1 nalaza ostaju potpuno reflektovana u AuthZ/scope i sigurnosnoj ocjeni.

## 13. Fazni plan popravki

### Faza 0 — safety net

- scoped ADMIN OU A/B E2E za svaki endpoint i user mapping;
- dvije instance sa zagrijanim scope cacheom i reparent test;
- parallel ancestor/descendant rename/reparent matrica;
- case-varijantni concurrent DN create;
- invalidator fault, RFC 4514 fixture, large-tree i no-op testovi.

### Faza 1 — authorization granica

- definisati OU manage/read-user permissions;
- source/destination subtree provjera za create/update/reparent/delete;
- actor-target i source/destination provjera user mappinga;
- auditirani SuperAdmin bypass;
- minimalni USER tree DTO.

### Faza 2 — distribuirani scope revision

- uvesti monotoni OU topology revision;
- emitovati durable change event u istoj transakcijskoj namjeri;
- cross-instance invalidacija/revision check;
- fail-closed postupanje za stale move/delete odluke.

### Faza 3 — concurrency i DB integritet

- serijalizovati hierarchy mutatione ili uvesti revision CAS;
- ponoviti graph/descendant/conflict provjere u transakciji;
- DB-enforced case-insensitive canonical DN identitet;
- race-safe delete snapshot i warning/audit semantika.

### Faza 4 — identity-provider ugovor

- RFC 4514 parser/serializer ili strogo dokumentovan subset;
- isti canonical DN ključ kroz manual, Entra/LDAPS materialization i update;
- migration collision report;
- length/escaping provjera nakon descendant rewritea.

### Faza 5 — invalidacija i operativnost

- obavezan principal invalidator sa outbox/retry/metricom;
- paging za users listu i lazy/minimal tree;
- hierarchy depth/node i mutation budget;
- batch/set-based descendant rewrite;
- no-op short circuit.

### Faza 6 — završna verifikacija

- svih 11 suiteova zeleno sa generated Prisma klijentom;
- ciljani E2E 10, 38, 41, 42 i 44 plus novi OU security scenariji;
- stvarni PostgreSQL serializable/concurrency testovi;
- multi-instance cache i directory-provider fixture matrica;
- rollback rehearsal i observability dashboard.

## 14. Rizik, rollback i acceptance

### Rizik implementacije

Scope enforcement može promijeniti instalacije koje scoped ADMIN trenutno koriste kao globalnog OU administratora. Topology revision i DN canonical key zahtijevaju migration inventar postojećih case collisiona i path/DN nekonzistentnosti. Set-based rewrite mora očuvati audit i unique ordering pri zamjeni ancestor patha.

### Rollback

- authorization enforcement uvoditi feature flagom uz security warning i obavezni bypass audit;
- revision/event mehanizam prvo dual-write, zatim enforce-read;
- DN canonical kolonu dodati nullable, backfillovati i tek nakon collision reporta uključiti unique;
- hierarchy CAS/lock može se vratiti na read-only maintenance režim, ne na neserijalizovani write;
- rollback cache promjene ne smije reaktivirati stari scope poslije movea.

### Globalni acceptance

1. Scoped ADMIN ne može čitati admin detalje niti mutirati OU/user izvan oba relevantna scopea.
2. Reparent/rename nema period u kojem druga instanca odobrava stari descendant scope.
3. Konkurentne topološke mutacije ne mogu proizvesti parent/path/DN nekonzistentnost.
4. Case-varijantni DN ima jedan DB identitet.
5. Mapping/delete revoke efekt je odmah vidljiv i pri cache faultu.
6. USER tree izlaže samo nužni DTO.
7. Manual i directory-sync DN ugovor je jedinstven i testiran.
8. Veliko stablo ima dokumentovane limite i predvidiv transakcijski trošak.

## 15. Traceability

| Nalaz                      | Kod/dokaz                                    | Test                                  | Faza |
| -------------------------- | -------------------------------------------- | ------------------------------------- | ---- |
| BA-organizational-units-01 | controller, mapping/update/delete helperi    | scoped ADMIN A/B E2E                  | 0–1  |
| BA-organizational-units-02 | scope catalog cache + `ouPath` evaluator     | two-instance stale move               | 0–2  |
| BA-organizational-units-03 | pre-transaction update snapshot              | concurrent ancestor/descendant matrix | 0–3  |
| BA-organizational-units-04 | insensitive precheck + case-sensitive schema | concurrent case DN                    | 0–3  |
| BA-organizational-units-05 | optional invalidator/try-catch               | mapping/delete cache fault            | 0–5  |
| BA-organizational-units-06 | tree roles + full response mapper            | low-role response contract            | 0–1  |
| BA-organizational-units-07 | DN normalize/rewrite helpers                 | RFC 4514/provider fixtures            | 0–4  |
| BA-organizational-units-08 | full reads + N descendant updates            | scale/depth benchmark                 | 0–5  |
| BA-organizational-units-09 | unconditional update/audit                   | no-op PATCH                           | 0–5  |

## 16. Otvorene pretpostavke

- Audit ne pretpostavlja da je ADMIN uvijek globalan; role assignment model eksplicitno podržava OU/service scope.
- Tree može biti potreban USER ulozi za ticket/request tokove, ali puni DN i interna metadata nisu dokazano nužni.
- PostgreSQL default collation/unique tretira DN string case-sensitive dok migration ne dokaže suprotno eksplicitnim indexom.
- Konačna RFC 4514 i directory source-of-truth odluka biće dodatno provjerena u modulu 35 — `directory-sync`.
- Korisnik je potvrdio prolaz kompletne CI/Playwright kolekcije, ali ona nema navedene negativne OU scope/multi-instance/concurrency scenarije.
