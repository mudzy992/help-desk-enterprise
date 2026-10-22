# Backend audit 03 — RBAC

**Status:** audit završen  
**Datum:** 2026-10-22  
**Modul:** `backend/src/modules/rbac`  
**Baseline ocjena:** **8,03/10**  
**Nalazi:** 5 P2, 3 P3, 7 pozitivnih zapažanja  
**Implementacija:** nije započeta; korekcije čekaju završetak kompletnog backend audita

## 1. Executive summary

RBAC modul ima malu i razumljivu površinu, strogu SuperAdmin zaštitu kontrolera, kanonski permission katalog, transakcijsku zamjenu role-permission veza i audit zapis u istoj transakciji. Promjena zahtijeva potpisani 15-minutni preview token vezan za ulogu, predloženi skup permissiona i konkretnog aktera. Nepoznati permission ključevi se odbijaju, a role holder cache invalidacija se pokreće poslije uspješnog commita.

Nije pronađen direktan put kojim obični ADMIN ili drugi korisnik mogu mijenjati role-permission matricu. Glavni nedostatak je optimistička konkurencija: preview token nije vezan za trenutni/baseline skup permissiona niti je jednokratan. Token zato može ostati validan poslije tuđe izmjene i do isteka ponovo prepisati novije stanje. Preview uticaja također simulira samo globalnu permission provjeru i može propustiti stvarni uticaj na OU/service-scoped assignment.

`SUPER_ADMIN` permission redovi su uređivi kroz isti API, iako authorization engine SuperAdminu efektivno daje cijeli katalog neovisno o tim redovima. UI i audit zato mogu tvrditi da je pravo uklonjeno dok runtime ponašanje ostaje nepromijenjeno.

## 2. Scope i inventar

| Metrika                    |                                     Vrijednost |
| -------------------------- | ---------------------------------------------: |
| TypeScript fajlovi         |                                             23 |
| Produkcijski fajlovi       |                                             18 |
| Spec fajlovi               |                                              5 |
| Produkcijske linije        |                                            995 |
| Kontroleri                 |                                              1 |
| Servisi                    |                                              1 |
| Direktne module zavisnosti | `audit-log`, `authentication`, `authorization` |

Pregledane povezane površine:

- `Role`, `Permission`, `RolePermission` i `UserRole` Prisma modeli;
- authorization permission katalog, default role matrica i shadow evaluator;
- principal-context invalidator;
- users role-assignment API i SuperAdmin invariant;
- policy-pack i install seed tokovi;
- frontend permissions panel i `rbac-api.ts`;
- E2E 38 te problem/change role tokovi 30–31;
- CLI `seed-default-role-permissions`.

## 3. API i zaštita

Cijeli `RolesController` koristi:

```text
SessionAuthenticationGuard + RoleGuard + RequireRoles(SUPER_ADMIN)
```

| Metoda i ruta                              | Namjena                        | Dodatni sigurnosni ugovor                 |
| ------------------------------------------ | ------------------------------ | ----------------------------------------- |
| `GET /roles`                               | lista uloga i broj permissiona | SuperAdmin only                           |
| `GET /roles/permissions/catalog`           | kanonski katalog               | SuperAdmin only                           |
| `GET /roles/:roleKey/permissions`          | trenutni skup                  | normalizovan role key, 404 ako ne postoji |
| `POST /roles/:roleKey/permissions/preview` | impact preview                 | actor-bound potpisani token               |
| `PUT /roles/:roleKey/permissions`          | puna zamjena skupa             | preview token + razlog + audit            |

DTO pipe koristi whitelist, `forbidNonWhitelisted` i transform. Permission ključevi moraju biti stringovi, a servis ih deduplikuje, trimuje, sortira i provjerava prema `allPermissionKeys`.

## 4. Podaci i transakcije

- `Role.key` i `Permission.key` su unique.
- `RolePermission(roleId, permissionId)` je unique i cascade vezan za role/permission.
- Zamjena briše sve veze uloge i kreira predloženi skup unutar jedne Prisma transakcije.
- Audit zapis je dio iste transakcije, pa permission promjena ne može commitovati bez audita.
- `previousPermissionKeys` se čita prije transakcije, a preview token ne nosi baseline fingerprint/version.
- Cache invalidacija nosilaca role poziva se tek nakon commita i nije dio durable transakcije.
- Schema nema role permission revision/version kolonu za optimistic concurrency.

## 5. Preview i impact model

Preview vraća:

- trenutni i predloženi permission skup;
- dodane i uklonjene ključeve;
- broj pogođenih `UserRole` redova;
- najviše tri before/after shadow uzorka;
- HMAC token sa `roleKey`, predloženim permissionima, actorom, `issuedAt` i `expiresAt`.

Token koristi postojeći JWT signing secret i constant-time poređenje potpisa. Ne sadrži trenutni permission skup, role revision, nonce ni consumed marker. Shadow uzorak svaku promijenjenu permission provjerava bez OU/service scope zahtjeva, iako stvarni assignment može biti scoped.

## 6. Seeder i sistemske uloge

Install seeder kreira sedam sistemskih uloga, katalog permission redova i nedostajuće veze. Operacija je aditivna i idempotentna u smislu duplih veza, ali namjerno ponovo dodaje default permission koji je administrator ranije uklonio. CLI dokumentuje ovu posljedicu i ima `--dry-run`; ipak ne postoji obavezna potvrda baseline hash-a između pregleda i apply koraka.

`Role.isSystem` postoji u schemi, ali runtime permission replacement ga ne koristi za posebna pravila. Posebno, `SUPER_ADMIN` se može urediti iako runtime evaluator efektivni SuperAdmin permission set izvodi iz cijelog kataloga.

## 7. Testovi i izvršeni gateovi

### 7.1. Postojeći dokazi

Pet spec fajlova pokriva:

- permission katalog;
- preview token potpis, expiry i actor/set binding;
- controller SuperAdmin guard;
- preview/replace/audit/invalidation servisni tok;
- default role permission seeding.

E2E 38 detaljno pokriva role assignment, OU scope i zaštitu posljednjeg SuperAdmina, ali ne poziva `/roles/:roleKey/permissions/preview` niti `PUT /roles/:roleKey/permissions`. E2E 30–31 koriste specijalizovane role, ali ne mijenjaju permission matricu.

### 7.2. Lokalni rezultat

```bash
npx jest --runInBand src/modules/rbac
```

Rezultat:

- **5 suiteova otkriveno**;
- **2 suitea prošla**;
- **7/7 izvršenih testova prošlo**;
- **3 suitea nisu kompajlirana** zbog nedostajućeg generated Prisma klijenta.

Blokada je isti reproducibility nalaz evidentiran u prethodna dva modula. Nije proglašena zelenim gateom.

## 8. Pozitivni nalazi

1. Sve role-management rute su eksplicitno ograničene na lokalnog SuperAdmina kroz zajednički authorization invariant.
2. Nepoznati permission ključ ne može biti upisan u matricu.
3. Permission zamjena i tamper-evident audit zapis commitaju se zajedno.
4. Preview token je potpisan, vremenski ograničen i vezan za aktera, ulogu i predloženi skup.
5. Reason je obavezan i ulazi u audit metadata zajedno sa starim i novim skupom.
6. Unique schema ograničenja sprečavaju duple role-permission veze.
7. Default seeder ima dry-run, detaljan rezultat i testove svježeg/install scenarija.

## 9. Registar nalaza

| ID         | Severity | Naslov                                                                                | Status   | Veličina |
| ---------- | -------- | ------------------------------------------------------------------------------------- | -------- | -------- |
| BA-rbac-01 | P2       | Preview nije vezan za baseline/revision i može prepisati noviju izmjenu               | otvoreno | M        |
| BA-rbac-02 | P2       | Preview token je ponovo upotrebljiv tokom cijelog TTL-a                               | otvoreno | M        |
| BA-rbac-03 | P2       | Scoped role impact preview može prikazati pogrešan rezultat                           | otvoreno | M        |
| BA-rbac-04 | P2       | `SUPER_ADMIN` permission matrica je uređiva, ali runtime je ignoriše                  | otvoreno | S        |
| BA-rbac-05 | P2       | Post-commit invalidacija nosilaca nije durable niti fail-closed                       | otvoreno | M        |
| BA-rbac-06 | P3       | Preview broj pogođenih broji assignment redove, ne jedinstvene korisnike              | otvoreno | S        |
| BA-rbac-07 | P3       | DTO nema eksplicitne limite za broj/dužinu permissiona i preview token                | otvoreno | S        |
| BA-rbac-08 | P3       | Aditivni seeder može vratiti namjerno uklonjena prava bez apply-time baseline potvrde | otvoreno | M        |

## 10. Detaljni nalazi

### BA-rbac-01 — Stale preview može izgubiti noviju odluku

- **Dokaz:** token potpisuje samo role key, predloženi skup, aktera i vrijeme. `previousPermissionKeys` se čita tek u replace toku i ne poredi s preview baselineom. Role nema revision polje.
- **Scenarij:** SuperAdmin A pregleda skup X; SuperAdmin B spremi skup Y; A unutar 15 minuta spremi X. Token ostaje validan i Y se tiho prepisuje.
- **Uticaj:** izgubljena privilegijska izmjena, audit `previousPermissionKeys` može opisati stanje koje nije bilo predmet pregleda, a korisnici mogu neočekivano dobiti ili izgubiti prava.
- **Korekcija:** preview mora nositi baseline hash/revision; replace radi optimistic compare-and-swap u transakciji i vraća `PREVIEW_STALE` ako se role revision promijenila.
- **Acceptance:** dva paralelna previewa; nakon prvog commita drugi PUT obavezno pada bez promjene/audita.
- **Owner:** RBAC owner.

### BA-rbac-02 — Preview token nije jednokratan

- **Dokaz:** token nema nonce/`jti`, server ne čuva consumed stanje, pa se isti token može koristiti više puta do 15 minuta.
- **Uticaj:** replay starog PUT-a može vratiti raniji permission skup nakon naknadne izmjene istog ili drugog SuperAdmina.
- **Korekcija:** revision CAS iz BA-rbac-01 već blokira većinu replaya; dodatno koristiti jednokratni nonce/DB preview zapis ili token vezati za expected revision i povećati revision pri svakom commitu, uključujući no-op odluku prema eksplicitnoj politici.
- **Acceptance:** drugi PUT istog tokena vraća stale/consumed i ne piše novi audit.
- **Owner:** RBAC owner.

### BA-rbac-03 — Scope-blind impact preview

- **Dokaz:** preview kreira zahtjev sa `requireOrganizationalUnitScope:false`, `requireServiceScope:false` i oba scope ID-a `null`. Authorization evaluator namjerno odbija scoped assignment na globalnoj provjeri.
- **Uticaj:** korisnik sa AGENT/ADMIN rolom ograničenom na OU ili servis može stvarno dobiti/izgubiti pravo unutar scopea, ali before/after odluka ostaje deny/deny i uzorak se ne prikazuje.
- **Korekcija:** evaluirati svaku pogođenu assignment stavku u njenom OU/service scopeu; report treba razlikovati globalni, OU i service efekat.
- **Acceptance:** OU-scoped i service-scoped fixture prikazuju tačan allow→deny ili deny→allow uz scope identitet.
- **Owner:** RBAC + authorization owner.

### BA-rbac-04 — Uređivanje `SUPER_ADMIN` matrice nema runtime efekt

- **Dokaz:** API dozvoljava replace za svaku postojeću ulogu. `toCurrentSessionResponse` i authorization evaluator SuperAdminu daju cijeli katalog neovisno o `RolePermission` redovima.
- **Uticaj:** UI i audit mogu prikazati uspješno uklanjanje SuperAdmin prava koje se u izvršenju nije promijenilo. To je opasan administracijski false assurance.
- **Korekcija:** ili zabraniti izmjenu `SUPER_ADMIN` permissiona kao immutable sistemske matrice, ili promijeniti cjelokupni SuperAdmin model tako da DB skup postane autoritativan. Ne kombinovati oba modela.
- **Acceptance:** API jasno vraća immutable-system-role grešku ili runtime test dokazuje da promjena stvarno mijenja pristup.
- **Owner:** RBAC/authorization owner.

### BA-rbac-05 — Invalidation nije dio pouzdanog commita

- **Dokaz:** `replaceRolePermissions` commituje matricu i audit, zatim poziva hook. `RolesService` invalidator drži kao optional; invalidator dalje best-effort hvata greške.
- **Uticaj:** korisnici do isteka cache TTL-a mogu zadržati uklonjeno pravo. API već vraća uspjeh i nema durable retry zapisa.
- **Korekcija:** učiniti invalidator obaveznim u produkcijskom DI-u; role revision/version mora biti dio DB izvora istine, uz outbox/retry i metriku cache invalidacije.
- **Acceptance:** Redis/invalidator fault test nakon replacea ne ostavlja stari grant efektivnim.
- **Owner:** RBAC + authorization/platform owner.
- **Veza:** specijalizacija BA-authorization-01.

### BA-rbac-06 — Pogođeni korisnici nisu distinct

- **Dokaz:** `userRole.count({roleId})` i sample `findMany` rade nad assignment redovima. Isti korisnik može istu rolu imati u više OU/service scopeova jer schema nema unique ograničenje koje bi to zabranilo.
- **Uticaj:** `affectedUserCount` može biti veći od broja osoba, a tri sample mjesta može zauzeti ista osoba.
- **Korekcija:** distinct user ID count i deterministički unique-user sample; zasebno prikazati broj assignmenta ako je koristan.
- **Acceptance:** korisnik sa dvije scoped assignment stavke broji se kao jedna osoba i najviše jedan sample user.
- **Owner:** RBAC owner.

### BA-rbac-07 — Nebounded DTO kolekcija/token

- **Dokaz:** DTO provjerava array/string, ali nema `ArrayMaxSize`, per-key `MaxLength` niti `MaxLength` za preview token. Razlog jedini ima limit 500.
- **Uticaj:** autorizovani ili kompromitovani SuperAdmin klijent može poslati ekstremno veliku kolekciju/token i izazvati nepotreban CPU/memory rad prije catalog odbijanja.
- **Korekcija:** array limit vezan za veličinu kataloga, per-key limit i realan token limit; zadržati globalni body limit kao dodatni sloj.
- **Acceptance:** oversized array/key/token završava kontrolisanim 400 prije servisa.
- **Owner:** RBAC API owner.

### BA-rbac-08 — Seeder može vratiti uklonjeno pravo

- **Dokaz:** seeder je aditivan i namjerno dodaje svaki default link koji nedostaje; CLI dry-run nije kriptografski/optimistički vezan za apply.
- **Uticaj:** operator može poslije dry-runa ili bez njega vratiti pravo koje je SuperAdmin namjerno uklonio, posebno ako se stanje promijeni između komandi.
- **Korekcija:** zahtijevati apply confirmation token/baseline hash ili eksplicitni `--restore-defaults`; audit treba nositi operator intent i baseline.
- **Acceptance:** običan maintenance run ne vraća policy override bez eksplicitne potvrde.
- **Owner:** backend operations/RBAC owner.

## 11. Baseline score

| Presjek                  |   Težina | Ocjena | Ponderisano | Obrazloženje                                                     |
| ------------------------ | -------: | -----: | ----------: | ---------------------------------------------------------------- |
| Arhitektura              |      10% |   8,30 |        0,83 | mali, čitljiv modul; optional invalidator i split state          |
| API i ugovori            |      12% |   8,40 |        1,01 | stroga ruta/DTO osnova; nedostaju bounds i immutable semantics   |
| AuthN/AuthZ/scope        |      15% |   8,20 |        1,23 | SuperAdmin-only; scope-blind preview i false SUPER_ADMIN edit    |
| Poslovna pravila         |      13% |   7,60 |        0,99 | preview/reason postoje; stale/replay nisu zatvoreni              |
| Podaci i transakcije     |      13% |   7,80 |        1,01 | atomic replace+audit; nema revision/CAS-a                        |
| Sigurnost i privatnost   |      12% |   8,30 |        1,00 | HMAC actor binding; replay i stale overwrite rizik               |
| Async/integracije        |       8% |   8,00 |        0,64 | invalidacija poslije commita bez durable retryja                 |
| Testovi                  |      10% |   7,50 |        0,75 | dobri unit scenariji; nema concurrency/scoped/E2E replace dokaza |
| Operativnost/performance |       7% |   8,20 |        0,57 | jak audit; count/sample i seeder intent nedovoljno precizni      |
| **Ukupno**               | **100%** |        | **8,03/10** | otvoreno pet P2 nalaza                                           |

## 12. Fazni plan popravki

### Faza 0 — safety net

- konkurentni preview A/B i replay test;
- scoped impact fixturei;
- SUPER_ADMIN permission replace contract test;
- invalidation fault test;
- distinct user count i DTO boundary testovi.

### Faza 1 — revision/CAS integritet

- uvesti role permission revision ili ekvivalentan baseline fingerprint;
- potpisati expected revision/current-set hash;
- provjeriti i povećati revision u istoj transakciji sa replaceom i auditom;
- drugi/replayed token vraća `PREVIEW_STALE`/`PREVIEW_CONSUMED`.

### Faza 2 — tačan impact i sistemske uloge

- scope-aware shadow uzorci i distinct-user statistika;
- zaključati `SUPER_ADMIN` permission matricu ili usvojiti jedan autoritativni DB model;
- dokumentovati pravila ostalih `isSystem` uloga.

### Faza 3 — invalidacija i operativna sigurnost

- obavezni produkcijski invalidator;
- durable revision/outbox/retry i alarm;
- seeder apply-time baseline potvrda i eksplicitni restore intent.

### Faza 4 — API bounds i puni dokaz

- bounded DTO-i;
- riješiti Prisma generation precondition;
- svih 5/5 RBAC suiteova;
- novi E2E preview→replace→access→audit→stale-replay tok.

### Faza 5 — dokumentacija i preračun

- BA-rbac-01–08 traceability do testova/commitova;
- operativni runbook za seeder i rollback;
- nova ocjena tek nakon finalnog CI SHA.

## 13. Traceability

| Nalaz      | Safety-net                    | Acceptance dokaz                           |
| ---------- | ----------------------------- | ------------------------------------------ |
| BA-rbac-01 | paralelni A/B preview         | revision CAS odbija drugi PUT              |
| BA-rbac-02 | isti token dva puta           | drugi PUT bez side effecta                 |
| BA-rbac-03 | OU/service assignment fixture | scope-aware impact report                  |
| BA-rbac-04 | SUPER_ADMIN replace test      | immutable greška ili stvarni runtime efekt |
| BA-rbac-05 | invalidator/Redis fault       | nema stale prava nakon uspješnog API-ja    |
| BA-rbac-06 | dupli scoped assignment       | distinct user count/sample                 |
| BA-rbac-07 | oversized DTO matrica         | kontrolisani 400                           |
| BA-rbac-08 | dry-run pa state drift        | apply odbijen bez nove potvrde             |

## 14. Konačna presuda

RBAC modul je dobro zaštićen od neprivilegovanog pristupa i ima snažan transakcijski audit temelj. Baseline **8,03/10** prvenstveno umanjuju concurrency i fidelity problemi u preview/replace ugovoru, a ne direktan auth bypass. Prije enterprise zatvaranja preview mora postati optimistic-concurrency dokaz stvarnog baselinea, scope impact mora biti vjerodostojan, a SuperAdmin permission model jednoznačan. Audit je završen; implementacija ostaje odgođena do završetka kompletnog backend audita.
