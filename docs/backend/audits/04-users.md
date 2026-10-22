# Backend audit 04 — users

**Status:** audit završen  
**Datum:** 2026-10-22  
**Modul:** `backend/src/modules/users`  
**Baseline ocjena:** **6,59/10**  
**Nalazi:** 3 P1, 6 P2, 8 pozitivnih zapažanja  
**Implementacija:** nije započeta; korekcije čekaju završetak kompletnog backend audita

## 1. Executive summary

`users` modul ima solidne lokalne primitive: ADMIN ne može upravljati SuperAdmin metom, samo SuperAdmin može dodijeliti `SUPER_ADMIN`, vlastita deaktivacija/brisanje su blokirani, a posljednji aktivni lokalni SuperAdmin zaštićen je zajedničkim PostgreSQL advisory lockom. Lozinke se hashiraju prije pohrane, reset aktivnog lokalnog korisnika postavlja obaveznu promjenu, reset controller opoziva sesije, a mutacije i audit uglavnom commitaju zajedno.

Ipak, centralni users API provjerava samo da je akter ADMIN/SUPER_ADMIN i da meta nije SuperAdmin. OU/service scope aktera se ne primjenjuje na listu, kreiranje, izmjenu, deaktivaciju, brisanje, reset/MFA/session operacije ni role assignment. OU-scoped ADMIN zato može enumerirati cijeli direktorij, mijenjati ili sigurnosno administrirati korisnika iz drugog OU-a i dodijeliti mu ulogu u proizvoljnom OU-u ili servisu. E2E 38 naslov spominje users scope, ali njegov scoped-ADMIN dio provjerava samo `/groups`; users operacije u tom testu izvršava SuperAdmin.

Kreiranje korisnika je podijeljeno na tri odvojena commita: user+audit, password+eventualna dostava i role assignment. Posebno, ADMIN koji zatraži `SUPER_ADMIN` dobija grešku tek nakon kreiranja aktivnog korisnika i postavljanja/slanja privremene lozinke. Identity i account-state promjene također nemaju jedinstven session/MFA invalidation ugovor: deaktivacija te directory link/unlink ne opozivaju postojeće sesije; reaktivacija može vratiti prethodno važeću, neisteklu sesiju.

## 2. Scope i inventar

| Metrika                    |                                                                                                    Vrijednost |
| -------------------------- | ------------------------------------------------------------------------------------------------------------: |
| TypeScript fajlovi         |                                                                                                            54 |
| Produkcijski fajlovi       |                                                                                                            32 |
| Spec fajlovi               |                                                                                                            22 |
| Produkcijske linije        |                                                                                                         2.704 |
| Kontroleri                 |                                                                                                             4 |
| Servisi                    |                                                                                                             1 |
| Direktne module zavisnosti | `authentication`, `authorization`, `audit-log`, `directory-sync`, `notifications`, `policy-packs`, `settings` |

Pregledane povezane površine:

- Prisma `User`, `UserRole`, `Role`, session, MFA i directory identifikatori;
- principal-context invalidator i authentication session registry;
- authorization context, role/scope evaluator i target-user helperi;
- Entra/LDAPS link/unlink i directory lifecycle semantika;
- SMTP dostava i HIBP provjera privremenih lozinki;
- privacy/anonymization polja koja users lista izlaže;
- E2E 37, 38 i 41 te svih 22 users spec fajla.

## 3. Arhitektura i lifecycle tokovi

### 3.1. Kreiranje lokalnog korisnika

1. Normalizuju se ime, e-mail, OU i role key.
2. Provjeravaju se OU, e-mail konflikt i postojanje sistemske role.
3. Prva transakcija kreira aktivnog local-only korisnika i `user.created` audit.
4. Druga transakcija upisuje password hash i `mustChangePassword`; zatim se lozinka šalje e-mailom ili vraća UI-u.
5. Treća transakcija dodjeljuje rolu i piše role audit.
6. Ponovo se učitava summary.

Koraci 3–5 nisu atomski, nemaju saga/outbox kompenzaciju i role authorization se izvršava tek u koraku 5.

### 3.2. Izmjena, deaktivacija i brisanje

- update selektivno mijenja display name, lokalni e-mail, OU i active status;
- deaktivacija i SuperAdmin provjera commitaju pod advisory lockom;
- update+audit su transakcijski, a principal invalidacija slijedi poslije commita;
- deaktivacija ne opoziva session redove niti MFA/recovery stanje;
- hard delete odbija korisnika sa otvorenim assigned/requested ticketima, zatim auditira PII i pokušava fizički obrisati red;
- brojni drugi historijski FK odnosi nisu preflightovani, pa operacija može završiti generičkom DB greškom.

### 3.3. Role lifecycle

- role assignment provjerava postojanje usera, role, OU-a i servisa;
- samo SuperAdmin može dodijeliti `SUPER_ADMIN`, i samo aktivnom čistom lokalnom identitetu;
- posljednji SuperAdmin je zaštićen pri removal/deactivation/delete/link operacijama;
- normalni assignment koristi `findFirst` pa `create`, bez schema unique ograničenja;
- DTO i servis dopuštaju istovremeno `organizationalUnitId` i `serviceId` te scoped `SUPER_ADMIN` zapis;
- principal invalidacija je post-commit best effort.

### 3.4. Password, identity i sigurnost naloga

- admin reset je dozvoljen samo aktivnom lokalnom računu, postavlja jak privremeni password i `mustChangePassword`, auditira bez secreta, pa controller opoziva sve sesije;
- HIBP provjera je optional i namjerno fail-open na neodređen verdict;
- SMTP greška vraća privremenu lozinku kroz API/UI umjesto gubitka pristupa;
- directory link uklanja lokalni hash; unlink kreira novu lokalnu privremenu lozinku;
- ni link ni unlink ne opozivaju postojeće sesije ili MFA artefakte;
- security controller može listati sesije, revoke-all i resetovati MFA, ali koristi istu scope-blind target provjeru.

## 4. API/guard/scope matrica

| Ruta                                             | Guard/role            | Target/actor kontrola                      | OU/service scope   | Napomena                                                        |
| ------------------------------------------------ | --------------------- | ------------------------------------------ | ------------------ | --------------------------------------------------------------- |
| `GET /users`                                     | session + ADMIN/SA    | nema target provjere                       | nema               | vraća globalni direktorij, e-mail, OU, role, MFA i ticket count |
| `POST /users`                                    | session + ADMIN/SA    | SA role provjera kasni u servis            | nema               | akter bira bilo koji OU i role key                              |
| `PATCH /users/:id`                               | session + ADMIN/SA    | ADMIN ne može SA; self-deactivate blokiran | nema               | mijenja OU i active status                                      |
| `DELETE /users/:id`                              | session + ADMIN/SA    | ADMIN ne može SA; self-delete blokiran     | nema               | hard delete                                                     |
| `POST /users/:id/reset-password`                 | session + ADMIN/SA    | ADMIN ne može SA                           | nema               | uspješan reset zatim revoke-all                                 |
| `GET /users/:id/roles`                           | session + ADMIN/SA    | **nema target provjere**                   | nema               | ADMIN može čitati SA assignment detalje                         |
| `POST/DELETE /users/:id/roles[/…]`               | session + ADMIN/SA    | target hijerarhija; SA grant samo SA       | nema               | arbitrary OU/service assignment                                 |
| `GET /users/:id/security`                        | session + ADMIN/SA    | target hijerarhija; self read dozvoljen    | nema               | MFA, password datumi i session metadata                         |
| `POST /users/:id/sessions/revoke-all`            | session + ADMIN/SA    | target hijerarhija; self zabranjen         | nema               | destruktivna cross-OU operacija                                 |
| `POST /users/:id/mfa/reset`                      | session + ADMIN/SA    | target hijerarhija; self zabranjen         | nema               | reason obavezan                                                 |
| `POST/DELETE /users/:id/link-directory-identity` | session + SUPER_ADMIN | servis blokira SA link                     | globalni SA bypass | identity transition                                             |
| `GET/PATCH /users/me/preferences`                | session               | isključivo vlastiti subject                | n/a                | odvojen self-service controller                                 |

`RoleGuard` na users rutama provjerava role key, ne resource permission i ne scope. Nema `RequirePermissions`, `OuAccessGuard` niti service-scope ekvivalenta na ovim kontrolerima.

## 5. Prisma, transakcije i konkurencija

- `User.email`, `entraObjectId` i `directoryObjectGuid` su unique.
- `UserRole` nema composite unique za `(userId, roleId, organizationalUnitId, serviceId)`; nullable scope dodatno zahtijeva eksplicitno PostgreSQL rješenje.
- Concurrent assignment obične role može oba puta proći `findFirst` i kreirati duplikat.
- SuperAdmin assignment ponavlja provjere pod istim advisory lockom, pa je njegov kritični identitetski invariant znatno jači.
- Deactivation, delete, SuperAdmin role removal i directory link dijele transaction-scoped advisory lock prije finalne provjere.
- Update/delete/role mutation audit je uglavnom u istoj transakciji sa domen mutacijom.
- Kreiranje je izuzetak: user, password i role nisu u jednoj transakcijskoj jedinici.
- Cache invalidation se izvršava nakon commita i zavisi od optional hooka/best-effort invalidatora; greška ne rollbackuje grant/revoke/update.
- Password delivery je external side effect poslije DB commita bez durable delivery outboxa.

## 6. Privilege-escalation analiza

### Horizontalna eskalacija

Najvažniji problem je cross-scope administracija. ADMIN sa assignmentom ograničenim na OU A prolazi class-level `RequireRoles(ADMIN)` i može:

- pretražiti i čitati korisnike iz OU B;
- premjestiti korisnika između OU-ova ili ga deaktivirati/obrisati;
- resetovati lozinku, opozvati sesije ili resetovati MFA korisnika iz OU B;
- dodijeliti/ukloniti obične role sa proizvoljnim OU/service scopeom;
- čitati role SuperAdmin mete kroz nezaštićeni `GET :userId/roles`.

To je P1 jer kompromitovani ili samo pogrešno scoped ADMIN dobija organizacijski globalan control plane.

### Vertikalna eskalacija

- Direktni ADMIN → `SUPER_ADMIN` grant je blokiran i servis ga ponovo provjerava.
- ADMIN ne može mutirati target koji trenutno ima `SUPER_ADMIN`.
- Međutim, ADMIN može kreirati korisnika sa traženom `SUPER_ADMIN` rolom: grant pada, ali tek nakon što je aktivni user i password već kreiran/dostavljen.
- Scoped `SUPER_ADMIN` assignment semantički ostaje globalni SuperAdmin jer authorization context scope ne ograničava `isSuperAdmin`; API ipak prima scope polja, stvarajući opasnu administracijsku iluziju.
- Istovremeni ordinary role grantovi mogu stvoriti duple assignment redove; to tipično ne širi efektivna prava, ali kvari revoke, prikaz i audit semantiku.

## 7. Testovi i izvršeni gateovi

### 7.1. Postojeći dokazi

Dvadeset dva spec fajla pokrivaju create/update/delete, list/pagination, role assign/remove, target hijerarhiju, posljednjeg SuperAdmina, temporary password/HIBP, link/unlink identiteta, guard metadata i preferences. Pozitivno su prisutni ciljani concurrency testovi posljednja dva SuperAdmin assignmenta.

E2E 37 pokriva širi authentication security lifecycle, E2E 38 users/groups/RBAC scenarije i posljednji-SuperAdmin race, a E2E 41 admin identity UX. Ipak, nema direktnog dokaza da scoped ADMIN ne može koristiti `/users`; scoped dio E2E 38 testira `/groups`, dok users lifecycle pozive šalje SuperAdmin. Nema E2E za session stanje nakon deactivate→reactivate ili directory link/unlink.

### 7.2. Lokalni rezultat

```bash
npx jest --runInBand src/modules/users
```

Rezultat:

- **22 suitea otkrivena**;
- **4 suitea prošla**;
- **13/13 izvršenih testova prošlo**;
- **18 suiteova nisu kompajlirana** zbog nedostajućeg `backend/src/generated/prisma/client` i posljedičnih `PrismaService` type grešaka.

Ovo nije zeleni gate. Blokada je isti checkout reproducibility problem evidentiran u modulima 01–03; `db:generate` nije ponavljan jer sandbox nema pristup Prisma binary hostu.

## 8. Pozitivni nalazi

1. Controller i servis zajedno sprečavaju ADMIN grant `SUPER_ADMIN` role i upravljanje SuperAdmin metom.
2. Self-deactivate i self-delete su eksplicitno blokirani.
3. Posljednji aktivni lokalni SuperAdmin zaštićen je zajedničkim PostgreSQL advisory lockom kroz relevantne konkurentne mutacije.
4. `SUPER_ADMIN` se može dodijeliti samo aktivnom, čistom local-only identitetu bez Entra/LDAPS veze.
5. Update/delete/role mutation i audit zapisi uglavnom commitaju atomski.
6. Reset ne radi nad inactive ili directory-managed računom, ne auditira secret i opoziva sve sesije nakon uspješnog password mutation toka.
7. Privremena lozinka je kriptografski generisana, hashirana prije pohrane, HIBP-pwned kandidati se odbacuju, a SMTP failure ima kontrolisan UI fallback.
8. Lista je deterministički paginirana, limitirana na 500 i total koristi isti filter kao stavke.

## 9. Registar nalaza

| ID          | Severity | Naslov                                                                                    | Status   | Veličina |
| ----------- | -------- | ----------------------------------------------------------------------------------------- | -------- | -------- |
| BA-users-01 | P1       | ADMIN users control plane ignoriše OU/service scope                                       | otvoreno | L        |
| BA-users-02 | P1       | Kreiranje usera/passworda/role nije atomsko i autorizacija role dolazi prekasno           | otvoreno | L        |
| BA-users-03 | P1       | Deactivate i identity transitioni ne opozivaju sesije/MFA lifecycle                       | otvoreno | L        |
| BA-users-04 | P2       | Concurrent ordinary role assignment može kreirati duplikate                               | otvoreno | M        |
| BA-users-05 | P2       | Role scope model dopušta besmislene dual-scope i lažno scoped SuperAdmin zapise           | otvoreno | M        |
| BA-users-06 | P2       | Post-commit principal invalidacija nije durable ni fail-closed                            | otvoreno | M        |
| BA-users-07 | P2       | Security controller koristi UUID pipe iako `User.id` nije UUID ugovor                     | otvoreno | S        |
| BA-users-08 | P2       | Hard delete preflight ne pokriva historijske reference i može završiti sirovom FK greškom | otvoreno | M        |
| BA-users-09 | P2       | User delete audit trajno kopira e-mail bez eksplicitne privacy/redaction politike         | otvoreno | M        |

## 10. Detaljni nalazi

### BA-users-01 — Scope-blind ADMIN kontrola korisnika

- **Dokaz:** tri users kontrolera dopuštaju ADMIN/SA preko `RequireRoles`; list query nema actor filter, a `assertCanManageTargetUser` zna samo actor/target `isSuperAdmin`. Nema OU/service permission provjere ni na user, role ili security mutacijama.
- **Scenarij:** ADMIN sa rolom scoped na OU A pozove listu, pronađe usera u OU B, resetuje mu MFA/lozinku ili ga deaktivira, zatim mu dodijeli ADMIN u service/OU scopeu koji sam akter ne kontroliše.
- **Uticaj:** horizontalna privilege eskalacija, globalno otkrivanje PII i takeover/DoS naloga preko cross-OU sigurnosnih operacija.
- **Korekcija:** definisati eksplicitni `user.manage`/security permission i resource resolver; list filtrirati na vidljive OU/service granice; source i destination scope provjeriti pri premještanju/grantu; samo SuperAdmin ima auditirani globalni bypass.
- **Acceptance:** E2E sa OU A/B dokazuje da scoped ADMIN ne vidi niti mutira B i ne može grantovati scope izvan vlastitog; SA bypass nosi request-linked audit.
- **Owner:** users + authorization owner.

### BA-users-02 — Parcijalno kreiranje aktivnog računa

- **Dokaz:** `createUser` prvo commituje user+audit, zatim zasebno commituje password i šalje ga, a tek potom zove `assignUserRole`. `assertCanAssignRole` se nalazi u posljednjem koraku.
- **Scenarij:** ADMIN pošalje `roleKey=SUPER_ADMIN`; user i password se kreiraju, password može biti poslan, zatim role grant vraća forbidden. Slično, DB/invalidation kvar pri role koraku ostavlja aktivan račun bez očekivane role.
- **Uticaj:** API prijavljuje neuspjeh uz trajni parcijalni side effect, orphan račun i nejasan secret-delivery/audit lifecycle.
- **Korekcija:** autorizovati i validirati cjelokupan intent prije side effecta; user+hash+role+audit commitovati u jednoj transakciji; dostavu raditi durable outboxom nakon commita, uz jasno pending/delivery stanje.
- **Acceptance:** forbidden role i fault-injection u svakom koraku ne ostavljaju user/role/password parcijalno stanje niti šalju secret za neuspjelu operaciju.
- **Owner:** users + notifications owner.

### BA-users-03 — Account/identity transitioni ne zatvaraju stare sesije

- **Dokaz:** samo reset-password i MFA reset zovu `SessionRegistryService.revokeAll`. `updateUser(isActive=false)`, `linkUserDirectoryIdentity` i `unlinkUserDirectoryIdentity` mijenjaju authn identitet bez session revoke-a; link/unlink nemaju ni principal invalidation hook.
- **Scenarij:** local user zadrži refresh/session artefakt nakon linka na directory identitet; deaktivirani user se kasnije reaktivira i koristi staru neisteklu sesiju; unlinkani directory user nastavlja staru provider-session vezu paralelno s novim local passwordom.
- **Uticaj:** zastarjela autentikacijska vjerodajnica preživljava sigurnosnu granicu i može zaobići očekivani novi IdP/password/MFA lifecycle.
- **Korekcija:** centralizovan transaction/outbox account-security transition ugovor: bump auth/session version, revoke sve sesije, invalidirati principal i rotirati/resetovati lokalni MFA/recovery prema dokumentovanoj politici.
- **Acceptance:** deactivate, link i unlink odmah odbijaju sve prethodne access/refresh sesije; reaktivacija ne oživljava stare tokene; fault test ne vraća 2xx bez durable revoke intent-a.
- **Owner:** users + authentication/directory owner.

### BA-users-04 — Dupli role assignmenti pod konkurencijom

- **Dokaz:** schema nema relevantan unique constraint; ordinary path radi `findFirst` izvan transakcije pa `create`. Samo SuperAdmin branch ponavlja provjeru pod globalnim lockom.
- **Uticaj:** paralelni POST-ovi kreiraju ekvivalentne redove, dupli audit i zbunjujući partial revoke; broj nosilaca role i UI mogu biti netačni.
- **Korekcija:** kanonski scope discriminator i DB unique constraint/index koji radi i za null scope; koristiti idempotent upsert i mapirati unique konflikt na postojeći assignment.
- **Acceptance:** 20 konkurentnih jednakih grantova ostavlja jedan red i deterministički jedan effective grant.
- **Owner:** users/data owner.

### BA-users-05 — Nejasna role scope kombinacija

- **Dokaz:** DTO i servis dopuštaju oba scope ID-a; evaluator OU i service zahtjeve tretira kao odvojene tipove assignmenta. `SUPER_ADMIN` assignment prihvata scope iako `isSuperAdmin` ostaje globalan.
- **Uticaj:** dual-scope assignment može biti neupotrebljiv na rutama koje traže samo jedan scope, a UI može prikazati „scoped SuperAdmin“ koji je u runtimeu globalan.
- **Korekcija:** zaključati kanonski union: global ili tačno jedan OU ili tačno jedan service; `SUPER_ADMIN` mora biti isključivo globalan i bez scope polja.
- **Acceptance:** API odbija dual-scope i scoped-SA zahtjev; migration/validator nalazi postojeće anomalije.
- **Owner:** users + authorization owner.

### BA-users-06 — Invalidation poslije commita je best effort

- **Dokaz:** update/assign/remove/delete pozivaju hook nakon commita; servisni hook je optional, a shared invalidator hvata greške. Nema outbox/retry potvrde.
- **Uticaj:** uklonjena role ili deaktivacija može ostati u cached principal kontekstu do TTL-a, dok API već potvrđuje uspjeh.
- **Korekcija:** obavezan produkcijski invalidator, DB authz/session revision provjerljiva na zahtjevu i durable outbox/retry sa metrikom.
- **Acceptance:** Redis/cache fault neposredno nakon revoke/deactivate ne dozvoljava stari grant.
- **Owner:** users + authorization/platform owner.
- **Veza:** specijalizacija `BA-authorization-01`.

### BA-users-07 — UUID parser nije usklađen sa User ID ugovorom

- **Dokaz:** security rute koriste `ParseUUIDPipe`, dok glavni users i directory controller prihvataju opaque string; Prisma `User.id` koristi aplikacijski generisan string/cuid ugovor.
- **Uticaj:** validan non-UUID user ID može dobiti 400 na `/security`, `/sessions/revoke-all` i `/mfa/reset`, iako ostale user rute rade.
- **Korekcija:** jedinstveni `UserIdPipe`/DTO usklađen sa Prisma generatorom i bounded string validacijom na svim rutama.
- **Acceptance:** isti stvarni user ID prolazi svaki users endpoint; malformed/oversized ID daje kontrolisan 400.
- **Owner:** users API owner.

### BA-users-08 — Hard delete nema kompletan dependency contract

- **Dokaz:** preflight provjerava samo otvorene assigned/requested tickete, a `User` učestvuje u session, MFA, audit, approvals, comments i drugim historijskim relacijama sa različitim referencijalnim pravilima.
- **Uticaj:** realan historijski korisnik može dobiti generički Prisma/FK failure umjesto domenske odluke; ponašanje se mijenja sa novim relacijama i teško je operativno objasniti.
- **Korekcija:** preferirati deactivate/anonymize lifecycle; ako hard delete ostaje, centralni dependency preflight i stabilni conflict kodovi moraju pokriti sve restriktivne relacije.
- **Acceptance:** fixture za svaku restriktivnu relaciju daje dokumentovan 409, bez 500 i bez parcijalnog audit zapisa.
- **Owner:** users + privacy/data owner.

### BA-users-09 — Delete audit kopira direktni identifikator

- **Dokaz:** `userDeleted` metadata sadrži puni `email` i display name. Nema retention/redaction oznake ni veze sa privacy anonymization workflowom.
- **Uticaj:** pokušaj brisanja korisnika može ostaviti novu trajnu kopiju PII-a u append-only auditu i biti u konfliktu s erasure/retention namjerom.
- **Korekcija:** usaglasiti s privacy politikom: pseudonimizovani subject fingerprint, eksplicitni legal/retention osnov i kontrolisana redaction/anonymization obrada audit metapodataka.
- **Acceptance:** privacy erasure test potvrđuje da audit ostaje forenzički koristan bez direktnog e-maila/display namea izvan odobrenog retention ugovora.
- **Owner:** users + privacy/audit owner.

## 11. Baseline score

| Presjek                  |   Težina | Ocjena | Ponderisano | Obrazloženje                                                          |
| ------------------------ | -------: | -----: | ----------: | --------------------------------------------------------------------- |
| Arhitektura              |      10% |   6,80 |        0,68 | jasne funkcije, ali fragmentiran lifecycle i optional hookovi         |
| API i ugovori            |      12% |   6,50 |        0,78 | dobra validacijska osnova; scope/ID/role-scope ugovor nepotpun        |
| AuthN/AuthZ/scope        |      15% |   5,20 |        0,78 | hijerarhija SA dobra; globalni cross-OU ADMIN control plane           |
| Poslovna pravila         |      13% |   7,40 |        0,96 | jak posljednji-SA invariant; lifecycle i delete granice nepotpune     |
| Podaci i transakcije     |      13% |   6,40 |        0,83 | većina audit mutacija atomska; create split i role duplikati          |
| Sigurnost i privatnost   |      12% |   6,10 |        0,73 | password osnova dobra; session transition i PII retention rizici      |
| Async/integracije        |       8% |   6,50 |        0,52 | kontrolisan SMTP fallback; nema outboxa/durable invalidacije          |
| Testovi                  |      10% |   7,20 |        0,72 | široki specovi; ključni scope/session scenariji nedostaju, 18 blocked |
| Operativnost/performance |       7% |   8,30 |        0,58 | paging i audit dobri; FK i invalidation observability slabi           |
| **Ukupno**               | **100%** |        | **6,59/10** | tri P1 nalaza ograničavaju baseline                                   |

Ocjena je direktni ponderisani rezultat bez ručnog podizanja. Jaka SuperAdmin concurrency zaštita i password primitive već su uračunate u pojedinačne presjeke; nijedan P1 nije ublažen pretpostavkom da se ADMIN operativno dodjeljuje samo globalno.

## 12. Fazni plan popravki

### Faza 0 — safety net i ugovori

- scoped ADMIN users E2E za list/read/create/update/delete/password/session/MFA/role tokove;
- fault-injection create testovi između user/password/role/delivery koraka;
- deactivate→reactivate i directory link/unlink session replay testovi;
- concurrent ordinary assignment test;
- ID, dual-scope, scoped-SA, FK i privacy fixturei.

### Faza 1 — scope authorization

- definisati users resource/permission model i source/destination scope pravila;
- filtrirati listu i total prema actor-visible scopeu;
- primijeniti target i requested role scope provjere na svaki endpoint;
- uvesti auditirani SuperAdmin global bypass;
- zatvoriti nezaštićeni role-list target read.

### Faza 2 — atomic create i delivery

- preautorizovati puni create intent;
- user, password, role i audit objediniti u jednu transakciju;
- secret delivery pretvoriti u durable outbox/status workflow;
- dodati idempotency/retry contract bez duplog naloga ili izgubljenog secreta.

### Faza 3 — account-security transition

- centralni revoke/session-version/principal-version servis;
- obavezno ga primijeniti na deactivate, link, unlink, reset i kritične role promjene;
- definisati MFA/recovery politiku pri promjeni IdP-a;
- dodati retry, metrike i fail-closed ponašanje.

### Faza 4 — schema i role scope integritet

- kanonski scope discriminator i unique assignment constraint;
- migracijski dedupe postojećih redova;
- zabraniti dual-scope i scoped SuperAdmin;
- idempotentni concurrent upsert.

### Faza 5 — delete/privacy/API hardening

- usaglasiti hard delete s privacy/anonymization servisom;
- centralizovati dependency preflight i stabilne konflikt kodove;
- ukloniti direktni PII iz delete audita ili dokumentovati/redigovati po retention politici;
- ujednačiti user ID validaciju i DTO bounds.

### Faza 6 — završna verifikacija

- svi users unit/integration testovi zeleni sa generisanim Prisma klijentom;
- ciljani E2E 37, 38 i 41 plus novi users-scope/session testovi;
- concurrency testovi na stvarnom PostgreSQL-u;
- Redis/SMTP/DB fault matrica i audit/privacy provjera;
- dokumentovan rollback i migration dry-run.

## 13. Rizik, rollback i acceptance

### Rizik implementacije

Najveći rizik je retroaktivno sužavanje ADMIN ponašanja: postojeće instalacije možda koriste obični ADMIN kao globalnog user administratora. Prije enforcementa treba inventarisati assignment scopeove, eksplicitno definisati global ADMIN semantiku i prikazati koje operacije će postati zabranjene. Schema unique migracija mora prvo detektovati i deterministički objediniti duplikate.

### Rollback

- feature flag za novi users scope enforcement može privremeno vratiti prethodni read/mutation policy samo uz security warning i audit;
- schema promjena ide expand–backfill/dedupe–validate–enforce, sa reverzibilnim expand korakom;
- session/version kolone se prvo dual-writeaju, zatim enforced čitaju;
- outbox se uvodi bez uklanjanja postojećeg delivery patha dok retry/metrics ne budu potvrđeni;
- rollback ne smije ponovo aktivirati staru sesiju nakon sigurnosne tranzicije.

### Globalni acceptance

1. Nijedan ADMIN ne može vidjeti ili mutirati korisnika/scope izvan vlastitog grant opsega.
2. Neuspjeli create nema trajni user, password, role, e-mail ni audit koji tvrdi uspjeh.
3. Deactivate/link/unlink trenutno i trajno odbijaju stare sesije; reactivate ih ne oživljava.
4. Posljednji aktivni lokalni SuperAdmin ostaje zaštićen u konkurentnim tokovima.
5. Ekvivalentan role assignment ima najviše jedan DB red.
6. Scope kombinacije i user ID format imaju jedinstven, testiran API ugovor.
7. Delete/privacy tok ne vraća generički FK 500 niti nepotrebno zadržava direktni PII.
8. Prisma-generated checkout, Jest i ciljani PostgreSQL/Redis/E2E gateovi su zeleni.

## 14. Traceability

| Nalaz       | Kod/dokaz                                             | Test koji treba dodati/proširiti  | Faza |
| ----------- | ----------------------------------------------------- | --------------------------------- | ---- |
| BA-users-01 | users/security controlleri, target helper, list query | scoped ADMIN users API E2E        | 0–1  |
| BA-users-02 | `create-user.ts`, password issuer, role assign        | step fault + forbidden SA create  | 0–2  |
| BA-users-03 | update/link/unlink vs session registry                | stale session i reactivate replay | 0–3  |
| BA-users-04 | `assign-user-role.ts`, `UserRole` schema              | concurrent duplicate grant        | 0–4  |
| BA-users-05 | role DTO/evaluator/SA context                         | dual-scope i scoped-SA contract   | 0–4  |
| BA-users-06 | UsersService invalidator hook                         | Redis/invalidator fault           | 0–3  |
| BA-users-07 | `user-security.controller.ts`                         | real generated user ID routes     | 0–5  |
| BA-users-08 | `delete-user.ts`, Prisma relations                    | per-relation hard-delete conflict | 0–5  |
| BA-users-09 | `record-user-change.ts`, privacy lifecycle            | erasure/audit redaction fixture   | 0–5  |

## 15. Otvorene pretpostavke

- Audit ne pretpostavlja da se `ADMIN` operativno dodjeljuje samo globalno; schema, role assignment API i authorization engine eksplicitno podržavaju scoped assignment.
- HIBP fail-open je trenutno dokumentovana sistemska politika, ne zaseban users nalaz; konačna procjena pripada authentication/settings cross-cutting analizi.
- Stvarna FK ponašanja hard deletea zahtijevaju integracijski fixture sa kompletnom generisanom Prisma shemom.
- Korisnik je ranije potvrdio da kompletna CI/Playwright kolekcija 01–56 prolazi, ali to nije zamjena za nedostajuće negativne users-scope/session scenarije.
