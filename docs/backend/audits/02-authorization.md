# Backend audit 02 — authorization

**Status:** audit završen  
**Datum:** 2026-10-22  
**Modul:** `backend/src/modules/authorization`  
**Baseline ocjena:** **8,48/10**  
**Nalazi:** 4 P2, 4 P3, 7 pozitivnih zapažanja  
**Implementacija:** nije započeta; korekcije čekaju završetak kompletnog backend audita

## 1. Executive summary

Authorization modul ima dobro izolovano, pretežno funkcionalno jezgro odluke. Permission, role, organizational-unit i service scope provjere su eksplicitne, scoped grantovi ne postaju globalni bez uskog allowlista pravila, neispravan ili nedostajući kontekst završava deny odlukom, a lokalni SuperAdmin invariant provjerava se i u autentikaciji i u autorizaciji. SuperAdmin bypass je fail-closed vezan za tamper-evident audit zapis prije izvršenja handlera.

Nisu pronađeni direktni P0/P1 privilege-escalation putevi u samoj decision funkciji. Najvažniji rizici su sistemski: cache invalidacija je best-effort pa oduzeta prava mogu ostati aktivna do 60 sekundi; ne postoji kompletan automatski manifest koji dokazuje da je svaki osjetljivi controller endpoint dobio odgovarajući guard/scope; read-only zaštita zavisi od ručno održavane liste URL prefiksa i trusted metadata izuzetaka; a kritični integracijski testovi ponovo su blokirani odsutnim Prisma klijentom.

## 2. Scope i inventar

| Metrika                    |                                Vrijednost |
| -------------------------- | ----------------------------------------: |
| TypeScript fajlovi         |                                        71 |
| Produkcijski fajlovi       |                                        46 |
| Spec fajlovi               |                                        25 |
| Produkcijske linije        |                                     2.722 |
| Kontroleri                 |                                         1 |
| Servisi                    |                                         2 |
| Direktne module zavisnosti | `audit-log`, `authentication`, `settings` |

Pregledane povezane površine:

- `src/common/principal-context/**` cache, DB loader i invalidator;
- svi controller fajlovi koji koriste `RoleGuard`, `OuAccessGuard`, `Require*`, `AuditPermissions` ili `AdminReadOperation`;
- role/permission Prisma relacije i `User.authzVersion` model;
- RBAC, users, groups, OU, policy-pack i directory-sync pozivi invalidacije;
- frontend session capability odgovor;
- E2E i unit testni trag scope/permission ponašanja.

## 3. Arhitektura i tok odluke

1. `SessionAuthenticationGuard` postavlja autentificirani principal i cached principal context na request.
2. `RoleGuard` ili legacy `OuAccessGuard` čita Nest metadata zahtjeve.
3. Scope locator uzima vrijednost redom `params → body → query`; group locator prvo mapira group ID na OU ID.
4. `AuthorizationService` ponovo učitava authorization context iz jedinstvenog principal-context izvora.
5. Ako je potreban OU/service scope, ID se provjerava u bazi i OU path se učitava.
6. `decideAuthorizationAccess` donosi fail-closed odluku nad jednom assignment stavkom.
7. Lokalni SuperAdmin može bypassovati standardne zahtjeve, ali se audit zapis mora commitovati prije handlera.
8. Globalni `AdminReadOnlyInterceptor` dodatno blokira mutacije u aktivnim administracijskim modulima.

`ShadowAuthorizationService` koristi isti evaluator i lookup ugovore, pa shadow rezultat ne uvodi zasebnu, divergentnu permission implementaciju.

## 4. Permission i scope semantika

| Pravilo                                     | Rezultat audita                                                |
| ------------------------------------------- | -------------------------------------------------------------- |
| Nema principala/konteksta                   | deny                                                           |
| Prazan role/permission token                | deny                                                           |
| Nema role/permission niti OU scope zahtjeva | deny                                                           |
| `RequirePermissions`                        | OR (`any`) unutar iste assignment stavke                       |
| `RequireAllPermissions`                     | AND unutar iste assignment stavke                              |
| Role + permission                           | oba moraju odgovarati istoj assignment stavci                  |
| OU scope                                    | assigned path pokriva isti path ili potomka                    |
| Prazan/globalni OU assignment               | ne daje OU pristup osim uskog `group.manage` pravila           |
| Service scope                               | konkretni service grant ili globalni `serviceId:null` grant    |
| Scoped grant na globalnoj ruti              | deny, osim eksplicitnog `oncall.read` allowlista               |
| SuperAdmin                                  | dozvoljen samo uz local-only invariant i uspješan bypass audit |
| Nepostojeći OU/service                      | deny prije handlera                                            |

Statička provjera aktuelnih kontrolera pronašla je 71 controller fajl sa `Require*` metadata i 77 sa authorization guardom. Nije pronađen controller koji ima `Require*` metadata bez `RoleGuard`/`OuAccessGuard`. Šest guardovanih kontrolera bez direktnog `Require*` dekoratora koriste service/resource filtering ili class/method kombinaciju i moraju se potvrđivati u pojedinačnim module auditima.

## 5. Podaci, cache i invalidacija

Principal context koristi dva Redis ključa po korisniku:

- pointer `authz:<user>:current` sa TTL 60 sekundi;
- versioned payload `authz:<user>:v<authzVersion>` sa istim TTL-om.

Normalna mutacija povećava `User.authzVersion`, zatim pointer pomjera na novu verziju bez payload-a; naredni zahtjev čita bazu. Redis outage na read strani sigurno pada na DB. Međutim, invalidator namjerno ne ruši primarnu mutaciju ako DB version bump ili Redis invalidacija ne uspiju. Ako oba koraka zakažu nakon uspješne role/user mutacije, postojeći cache payload ostaje autoritativan do TTL-a.

OU scope koristi materialized path. Ispravnost move/rename cascade logike pripada modulu `organizational-units`, ali authorization se oslanja na taj path i mora biti uključen u cross-module acceptance matricu.

## 6. Read-only mode

Globalni interceptor klasifikuje zahtjev po HTTP metodi i ručnoj listi route prefiksa. Mutacije unutar aktivnih modula se blokiraju, osim konfigurisanih bypass uloga. Malobrojni RPC-style POST read endpointi koriste `@AdminReadOperation`; `/directory-sync/read` i `/policy-packs/validate` imaju dodatne path izuzetke.

Nečitljiva ili neispravna konfiguracija blokira mutaciju fail-closed. Međutim, nova admin ruta izvan ručno navedene liste nije automatski pokrivena, a trusted metadata može novu POST mutaciju pogrešno označiti kao read.

## 7. Testovi i izvršeni gateovi

### 7.1. Postojeća pokrivenost

Postoji 25 spec fajlova za:

- permission/role OR/AND semantiku;
- OU i service scope;
- fail-closed nepoznate/prazne scopeove;
- SuperAdmin local-only i audit ponašanje;
- Role/Ou guardove;
- read-only konfiguraciju, klasifikaciju i enforcement;
- shadow evaluator izolaciju;
- default permission katalog i i18n pokrivenost;
- current-session mapper.

### 7.2. Lokalni rezultat

```bash
npx jest --runInBand src/modules/authorization
```

Rezultat:

- **25 suiteova otkriveno**;
- **15 suiteova prošlo**;
- **79/79 izvršenih testova prošlo**;
- **10 suiteova nije kompajlirano** jer generated Prisma klijent ne postoji.

Prisma generator je u prethodnom modulu potvrđeno environment-blocked mrežnim pristupom `binaries.prisma.sh`. Ovo nije proglašeno zelenim gateom. Statički decorator/guard census i postojeći backend lint jesu zeleni.

## 8. Pozitivni nalazi

1. Decision jezgro je čista funkcija sa detaljnim reason kodovima i fail-closed defaultima.
2. Permissioni iz različitih assignmenta se ne kombinuju za AND zahtjev niti sa scopeom drugog assignmenta.
3. OU path provjera koristi segment granicu (`assigned/`), pa `/A` ne pokriva `/AB`.
4. Nepostojeći OU/service i neispravan SuperAdmin invariant završavaju deny odlukom.
5. SuperAdmin bypass ne izvršava handler ako audit transakcija ne uspije.
6. Redis read failure pada na izvor istine u bazi umjesto da preskoči autorizaciju.
7. Permission katalog, default role matrica i prijevodi imaju direktne unit guardove.

## 9. Registar nalaza

| ID                  | Severity | Naslov                                                                                       | Status   | Veličina |
| ------------------- | -------- | -------------------------------------------------------------------------------------------- | -------- | -------- |
| BA-authorization-01 | P2       | Best-effort invalidacija može zadržati oduzeta prava do cache TTL-a                          | zatvoreno | M        |
| BA-authorization-02 | P2       | Ne postoji potpuni route-to-authorization manifest i CI guard                                | zatvoreno | L        |
| BA-authorization-03 | P2       | Read-only zaštita zavisi od ručno održavane liste ruta i trusted izuzetaka                   | otvoreno | M        |
| BA-authorization-04 | P2       | Integracijski testni gate zavisi od mrežnog Prisma engine downloada                          | otvoreno | M        |
| BA-authorization-05 | P3       | Current-session response gubi scope uz permission capabilityje                               | otvoreno | M        |
| BA-authorization-06 | P3       | Dekoratori prihvataju proizvoljne stringove umjesto catalog union tipa                       | otvoreno | S        |
| BA-authorization-07 | P3       | Dupli `RoleGuard` + `OuAccessGuard` izvršavaju istu odluku i dedupeuju audit prve evaluacije | otvoreno | S        |
| BA-authorization-08 | P3       | Read-only exact-path izuzeci nisu kanonski normalizovani                                     | otvoreno | S        |

## 10. Detaljni nalazi

### Implementacijski status Vala 2 (2026-10-24)

- **W2.2:** `BA-authorization-01` je zatvoren na SHA `10e8fd6ea1c328d647b6f2bc77960567f8bc8af5`, CI `40119814862`; svaki cached principal sada zahtijeva PostgreSQL authority fence.
- **W2.3:** SHA `201678ac5b77d65bc4b2fc70b18132e0bbbadb74`, CI `40121407427`, uvodi centralnu permission + OU/service/ownership odluku bez role-key inputa i real-PostgreSQL cross-user/cross-OU/service negativnu matricu.
- **W2.6:** SHA `52b5f1af95e7c650cfecef91a88a602edd5279e8`, CI `40127087672`, zatvara `BA-authorization-02`: svih 610 HTTP ruta i worker root imaju iscrpnu `authenticated/public/webhook/worker` klasifikaciju, owner i dokaz; CI odbija implicitnu petu klasu. Preostali permission/scope rollout nalazi ostaju otvoreni.

### BA-authorization-01 — Bounded stale grant nakon neuspjele invalidacije

- **Dokaz:** `PrincipalContextInvalidator` hvata DB i Redis greške i ne ruši mutaciju; cache pointer/payload imaju TTL 60 sekundi. Komentar obećava instant deactivation u normalnom toku, ali kompletan failure ostavlja stari payload.
- **Uticaj:** uklonjena uloga/permission, OU premještaj ili deaktivacija mogu ostati efektivni do 60 sekundi nakon uspješne poslovne mutacije.
- **Root cause:** availability-first best-effort invalidacija bez durable outbox/retry zapisa.
- **Korekcija:** sigurnosno osjetljive revocation/deactivation mutacije moraju zapisati version bump u istoj DB transakciji; Redis pointer je optimizacija. Za cross-table izmjene koristiti transactional outbox ili obavezni post-commit retry/metric.
- **Acceptance:** fault-injection testovi DB/Redis invalidacije; uspješna revocation mutacija više ne ostavlja stari grant vidljiv kroz cache.
- **Owner:** authorization + users/RBAC/platform owner.

### BA-authorization-02 — Nema kompletnog authorization ownership manifesta

- **Dokaz:** guard/decorator census je ad-hoc; repozitorij nema machine-readable registar svih controller metoda sa authn, role, permission, OU/service scope i resource-level ownerom. Postojeći testovi potvrđuju evaluator, ne kompletnost primjene na svaku rutu.
- **Uticaj:** nova ili premještena osjetljiva ruta može ostati samo session-guardovana ili potpuno bez scope metadata, a decision testovi i dalje ostaju zeleni.
- **Root cause:** authorization policy je distribuiran kroz Nest dekoratore i service filtere bez coverage guarda.
- **Korekcija:** generisati route authorization registry; svaka ne-javna ruta mora imati eksplicitnu policy klasifikaciju (`guard`, `resource-filtered`, `self-only`, `public`), owner i dokaz.
- **Acceptance:** CI pada za novu nekatalogizovanu controller metodu, metadata bez guarda i guard bez dokumentovane resource politike.
- **Owner:** backend architecture/authorization owner.

### BA-authorization-03 — Drift read-only route registra

- **Dokaz:** `adminReadOnlyRouteModules` ručno navodi prefikse; `@AdminReadOperation` može isključiti bilo koji mutating HTTP zahtjev iz blokade. Nema testa koji poredi kompletan admin mutation census sa registrom.
- **Uticaj:** nova konfiguracijska ruta može zaobići aktivni read-only režim ili legitimna read RPC ruta može biti pogrešno blokirana.
- **Root cause:** URL klasifikacija nije izvedena iz route/policy manifesta.
- **Korekcija:** povezati read-only klasifikaciju sa centralnim route registryjem i allowlistati read RPC izuzetke po handler identitetu, ne samo string putanji.
- **Acceptance:** svaka admin mutation ruta pripada tačno jednom lockable modulu; nekatalogizovana mutacija ruši guard test.
- **Owner:** authorization/configuration platform owner.

### BA-authorization-04 — Prisma blokira puni modul test

- **Dokaz:** 10/25 suiteova ne kompajlira bez `src/generated/prisma/client`; engine download nije dostupan u audit sandboxu.
- **Uticaj:** guard, service, shadow i interceptor integracija nisu lokalno potpuno dokazani u clean/offline okruženju.
- **Korekcija:** zajednički backend-platform nalaz BA-authentication-07: pinovani engine u CI image/cacheu ili dozvoljeni mirror i eksplicitna generation precondition faza.
- **Acceptance:** svih 25 suiteova i backend build prolaze bez implicitnog javnog runtime downloada.
- **Owner:** backend platform/CI owner.

### BA-authorization-05 — Capability response bez scopea

- **Dokaz:** `toCurrentSessionResponse` vraća union svih `permissionKeys`, ali ne vraća assignment OU/service scope uz permission.
- **Uticaj:** frontend može prikazati globalnu akciju korisniku koji permission ima samo u jednom scopeu; backend je i dalje odbija, pa ovo nije authorization bypass, ali stvara pogrešan capability UX i nepotrebne 403 zahtjeve.
- **Korekcija:** vratiti strukturisane effective grants ili eksplicitno ograničiti response na globalne capabilityje; zadržati backend kao jedini enforcement.
- **Acceptance:** scoped assignment fixture ne proizvodi lažni globalni capability.
- **Owner:** authorization + frontend session owner.

### BA-authorization-06 — Stringly typed policy metadata

- **Dokaz:** `RequirePermissions`, `RequireAllPermissions`, `RequireRoles` i `AuditPermissions` primaju `readonly string[]`; SuperAdmin bypass dozvoljava svaki neprazan requirement token.
- **Uticaj:** typo u permission/role ključu blokira normalne korisnike, ali SuperAdmin nastavlja kroz auditirani bypass, pa greška može ostati skrivena.
- **Korekcija:** izvesti union tipove iz constants kataloga i dodati runtime catalog validaciju koja fail-closed razlikuje nepoznati token.
- **Acceptance:** compile-time i runtime test odbijaju nepoznati role/permission ključ i za SuperAdmin.
- **Owner:** authorization owner.

### BA-authorization-07 — Redundantni guardovi i audit detalj

- **Dokaz:** `reports` i `sla/compliance` koriste i `RoleGuard` i `OuAccessGuard`; oba prolaze kroz isti evaluator. SuperAdmin audit je deduplikovan po requestu pa sadržaj prve evaluacije postaje jedini zapis.
- **Uticaj:** dupli DB/cache lookup i moguć nepotpun audit scope ako prva evaluacija nema iste zahtjeve kao druga nakon budućeg refaktora.
- **Korekcija:** standardizovati jedan policy guard; OU decorator već uključuje OU scope u `RoleGuard` evaluaciju.
- **Acceptance:** jedna odluka i jedan kompletan audit zapis po requestu.
- **Owner:** authorization + reports/SLA owner.

### BA-authorization-08 — Exact-path normalizacija

- **Dokaz:** read-only izuzeci koriste exact string set poslije uklanjanja queryja, ali ne normalizuju završni `/`; `/directory-sync/read` i `/directory-sync/read/` klasifikuju se različito.
- **Uticaj:** legitimni read RPC može biti blokiran u read-only režimu zavisno od proxy/router canonicalizacije.
- **Korekcija:** kanonski normalizovati trailing slash ili koristiti handler metadata kao jedini izvor izuzetka.
- **Acceptance:** slash/query varijante daju identičnu klasifikaciju.
- **Owner:** authorization owner.

## 11. Baseline score

| Presjek                  |   Težina | Ocjena | Ponderisano | Obrazloženje                                                             |
| ------------------------ | -------: | -----: | ----------: | ------------------------------------------------------------------------ |
| Arhitektura              |      10% |   8,80 |        0,88 | čisto decision jezgro; politika primjene distribuirana                   |
| API i ugovori            |      12% |   8,60 |        1,03 | jasni reason/scope ugovori; capability response gubi scope               |
| AuthN/AuthZ/scope        |      15% |   8,80 |        1,32 | jak fail-closed evaluator; nema globalnog route manifesta                |
| Poslovna pravila         |      13% |   8,50 |        1,11 | dobra AND/OR i assignment semantika; read-only drift rizik               |
| Podaci i transakcije     |      13% |   8,30 |        1,08 | versioned cache; invalidacija nije transakcijski garantirana             |
| Sigurnost i privatnost   |      12% |   8,50 |        1,02 | nema pronađenog direktnog bypassa; bounded stale grant                   |
| Async/integracije        |       8% |   8,00 |        0,64 | Redis fallback dobar za read; mutation invalidation best-effort          |
| Testovi                  |      10% |   8,20 |        0,82 | široki decision testovi; 10 suiteova blokirano i nema route census gatea |
| Operativnost/performance |       7% |   8,30 |        0,58 | reason/reporting jaki; dupli guard lookup i manjak invalidation alarma   |
| **Ukupno**               | **100%** |        | **8,48/10** | otvorena četiri P2 sistemska nalaza                                      |

## 12. Fazni plan popravki

### Faza 0 — safety net i machine-readable policy census

- generisati controller route/policy registry;
- klasifikovati svaku rutu kao public, self-only, guard-enforced ili resource-filtered;
- dodati cache invalidation fault-injection testove;
- dodati read-only route completeness i trailing-slash testove.

### Faza 1 — revocation/invalidation integritet

- premjestiti `authzVersion` bump u istu DB transakciju sa sigurnosno važnim mutationima;
- uvesti retry/outbox i metriku za neuspjelu Redis invalidaciju;
- dokazati deactivation, role removal, OU change i permission change.

### Faza 2 — policy registry i read-only hardening

- CI guard za nekatalogizovane rute i metadata/guard mismatch;
- read-only module ownership iz centralnog registra;
- zamijeniti path-only read izuzetke handler metadata identitetom;
- ukloniti redundantne `OuAccessGuard` kombinacije.

### Faza 3 — typed policy i capability ugovor

- union tipovi i runtime validacija role/permission ključeva;
- structured scoped capability response ili samo globalne capability vrijednosti;
- frontend contract fixture za novi response.

### Faza 4 — reproducibilni test gate

- riješiti zajednički Prisma engine/generation precondition;
- izvršiti 25/25 authorization suiteova;
- pokrenuti ciljane RBAC/users/groups/OU/reports/SLA E2E tokove i registry guard.

### Faza 5 — dokumentacija i preračun

- povezati BA-authorization-01–08 sa testovima i commitima;
- objaviti route/policy matricu;
- ponoviti score i zatvoriti samo uz finalni CI dokaz implementacijskog SHA.

## 13. Traceability

| Nalaz               | Primarni dokaz                  | Acceptance dokaz                   |
| ------------------- | ------------------------------- | ---------------------------------- |
| BA-authorization-01 | invalidator + cache TTL         | DB/Redis fault-injection matrica   |
| BA-authorization-02 | controller census               | route policy registry CI guard     |
| BA-authorization-03 | read-only constants/interceptor | admin mutation completeness test   |
| BA-authorization-04 | 15 pass / 10 blocked            | 25/25 suiteova + build             |
| BA-authorization-05 | current-session mapper          | scoped capability contract test    |
| BA-authorization-06 | decorator signatures/evaluator  | unknown-token compile/runtime test |
| BA-authorization-07 | reports/SLA guard lista         | single-decision audit test         |
| BA-authorization-08 | exact path set                  | canonical path test matrica        |

## 14. Konačna presuda

Authorization decision engine je kvalitetan i audit nije pronašao direktan privilege escalation u njegovoj aktuelnoj logici. Baseline **8,48/10** odražava da enterprise authorization kvalitet ne zavisi samo od ispravne funkcije odluke: mora postojati dokaz da je politika primijenjena na svaku rutu i da oduzimanje prava ne može ostati aktivno zbog best-effort invalidacije. Audit modula je završen; implementacija osam nalaza ostaje odgođena do završetka kompletnog backend audita.
