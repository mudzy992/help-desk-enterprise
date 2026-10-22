# Backend audit 09 — `security`

**Status:** audit završen  
**Datum:** 2026-10-22  
**Rizik modula:** kritičan  
**Baseline ocjena:** **6,00/10**  
**Nalazi:** 3 P1, 6 P2, 2 P3

## 1. Executive summary

Modul ima dobru osnovnu podjelu odgovornosti i pravilno štiti administrativne read/write rute session autentikacijom i `SUPER_ADMIN` ulogom. Passkey assertion zahtijeva user verification, challenge i confirmation marker su vezani za registry session i purpose, marker se atomski troši, rate-limit vrijednosti imaju bounds i cross-field validaciju, a sigurnosni journal i metrike ne izlažu sirove IP/e-mail podatke.

Baseline ipak ostaje **6,00/10**. Najkritičnije je da promjena login rate-limit zaštite prolazi bez dodatne potvrde identiteta kada SuperAdmin nema TOTP i nema passkey marker, iako servisni komentar i korisnički tok obećavaju obavezan step-up. Emergency bulk password reset prvo postavlja flagove, zatim opoziva sesije po korisniku; kvar registryja ostavlja već označenom računu aktivnu sesiju, vraća HTTP 200 i nema durable retry manifest. Za privilegovane promjene zasebni auth audit zapisi su best-effort i mogu potpuno nestati.

Nema P0: osnovni route guardovi nisu zaobiđeni i nije pronađeno direktno cross-user/cross-role čitanje. Tri P1 nalaza zahtijevaju prvu implementacijsku fazu nakon završetka kompletnog backend audita; sada se popravke ne implementiraju.

## 2. Scope i inventar

Direktna produkcijska površina:

- 9 produkcijskih TypeScript fajlova, 999 LOC;
- 5 kontrolera, 3 servisa i 1 Nest modul;
- 6 direktnih spec fajlova;
- zavisnosti: `authentication`, `authorization`, `audit-log`, `settings`, `security-audit-webhook` i principal-context infrastruktura.

Pregledani tokovi:

- `SecurityIdentityController` + `IdentityPasskeyService`;
- `SecurityRateLimitsController` + `SecurityRateLimitsService`;
- `BulkPasswordResetController` + `BulkPasswordResetService`;
- `SecurityAuditLogController`;
- `SecurityMetricsController`;
- challenge store, passkey credential verifier, session registry, MFA, rate-limit config/loader, settings batch write i audit repository;
- E2E 37, 39, 46 i 47.

Van scopea detaljne ocjene, ali pregledano na granici: kriptografska ispravnost kompletnog audit chaina je u [auditu 08](08-audit-log.md), a delivery webhooka će biti ocijenjen u modulu 10.

## 3. Arhitektura i lifecycle tokovi

### 3.1. Passkey step-up

1. Session guard učitava principal i registry `sid`; legacy token bez `sid` je odbijen.
2. Caller šalje opciono `purpose`; kontroler ga trimuje, ali ga ne mapira na server-side action registry.
3. `start` učitava korisnikove credential ID-jeve i RP konfiguraciju, generiše challenge sa `userVerification: required` i sprema ga pod session/purpose ključem.
4. `verify` troši challenge i zajedničkom credential servisu predaje korisnika, assertion, RP, UV zahtjev i IP.
5. Nakon uspjeha kreira se marker TTL-a 120 sekundi pod istim session/purpose ključem.
6. Potrošač koristi atomski `consume`; marker je single-use.

Session i purpose isolation su dobri. Slabost je da javni endpoint dozvoljava svakom autentificiranom calleru proizvoljan purpose do 64 znaka, uključujući interne privilegovane purpose vrijednosti, a marker ne sadrži actor/role epoch niti se pri potrošnji ponovo provjerava credential status.

### 3.2. Rate-limit konfiguracija

GET vraća efektivnu konfiguraciju i bounds. PUT prvo validira svako integer polje i dvije cross-field invarijante, zatim pokušava potrošiti passkey marker. Ako markera nema, TOTP se provjerava samo kada je MFA već omogućen. Kod MFA-disabled SuperAdmina tok direktno prelazi na settings batch — fail-open identitetska potvrda.

`SettingsService.setSettingValues` atomarno zapisuje osam vrijednosti, verzije i razlog. Login limiter ih učitava po zahtjevu i na grešku koristi sigurnije default vrijednosti. Zasebni `auth.rate_limits_changed` audit nije u istoj transakciji i greška se guta.

### 3.3. Bulk password reset

Servis strogo zahtijeva purpose-scoped passkey marker ili važeći TOTP; bez oba faktora odbija poziv. Lista obuhvata aktivne lokalno upravljane, neanonymizirane račune sa lokalnim hashom, bez directory/Entra identiteta, pa u memoriji izuzima sve SuperAdmin račune.

Nakon toga jedan `updateMany` postavlja `mustChangePassword`, ali zasebna petlja opoziva sesije. Greška jednog korisnika se broji i obrada nastavlja; cache invalidacija i zbirni audit su best-effort. Operacija je idempotentna za flag i ponovnim ručnim pozivom može ponovo pokušati revokaciju, ali nema durable work itema, automatskog retryja ni statusa koji sprječava HTTP 200 dok kompromitovana sesija ostaje aktivna.

### 3.4. Security journal, metrike i webhook status

Journal je globalni SuperAdmin view nad postojećim audit repozitorijem i repository query je fiksiran na `auth.*`; caller ne može proširiti action namespace. `userId` pokriva target ili actor semantiku, rezultat je cursor-paginiran i `no-store`.

Metrics endpoint vraća samo agregatne minute/count vrijednosti (`login-429`, account delay, MFA failure, HIBP skip). Webhook status vraća agregatni status/counter/time model bez URL-a i tajne. Oba endpointa su SuperAdmin-only i `no-store`.

## 4. API/guard/scope matrica

| Ruta                                     | Guard/uloga             | Scope                       | Step-up                               | Bilješka                  |
| ---------------------------------------- | ----------------------- | --------------------------- | ------------------------------------- | ------------------------- |
| `POST /security/identity/passkey/start`  | session                 | vlastiti principal/session  | početak passkey                       | purpose bira klijent      |
| `POST /security/identity/passkey/verify` | session                 | vlastiti principal/session  | UV passkey assertion                  | izdaje 120 s marker       |
| `GET /security/rate-limits`              | session + `SUPER_ADMIN` | globalno                    | ne                                    | bounds + effective config |
| `PUT /security/rate-limits`              | session + `SUPER_ADMIN` | globalno                    | passkey ili TOTP samo ako MFA enabled | MFA-disabled fail-open    |
| `POST /security/bulk-password-reset`     | session + `SUPER_ADMIN` | svi eligible lokalni računi | obavezan passkey/TOTP                 | SuperAdmini izuzeti       |
| `GET /security/audit-log`                | session + `SUPER_ADMIN` | globalni `auth.*`           | ne                                    | bounded `take`, cursor    |
| `GET /security/metrics/last-hour`        | session + `SUPER_ADMIN` | globalni agregat            | ne                                    | bez PII                   |
| `GET /security/metrics/audit-webhook`    | session + `SUPER_ADMIN` | globalni agregat            | ne                                    | bez adrese/tajne          |

Horizontalna eskalacija nije pronađena: passkey challenge/marker su vezani za session, assertion verifier prima isti subject, a drugi session istog korisnika ne može trošiti marker. Vertikalni guardovi postoje na svim administrativnim rutama. Preostali vertikalni rizik je capability marker koji se može unaprijed mintati za privilegovani purpose bez role/authorization epoch veze, te no-MFA step-up bypass na rate-limit writeu.

## 5. Validacija, stanje i transakcije

- Rate-limit polja su integer-only i bounded; max delay ne može biti manji od base delay, a account delay threshold ne može biti iznad IP thresholda.
- Osam setting vrijednosti zapisuje se u jednom settings batchu; auth audit je izvan batcha.
- Loader fail-safe koristi default na nečitljivoj/nevalidnoj vrijednosti.
- Bulk reset eligibility i role exclusion nisu zaključani sa updateom; role/identity stanje može se promijeniti između `findMany` i `updateMany`.
- Bulk flag, session revocation, principal cache i aggregate audit nisu jedna atomic/durable saga.
- Bulk odgovor ima samo zbirni `failedUsers`; nema operation ID, failed target manifest ni status endpoint.
- Journal `take` je bounded; `cursor`, `action` i `userId` nemaju maksimalnu dužinu.
- Passkey purpose ima samo maksimalnu dužinu, bez enum/allowliste i minimalnog character ugovora nakon trimovanja.

## 6. Sigurnost, privatnost i privilege escalation

Pozitivne kontrole uključuju UV-required passkey, single-use challenge/marker, session binding, TOTP fallback, SuperAdmin guard, no-store odgovore i agregatnu privatnost. Assertion payload ne završava u security audit metadata.

Napadački/incident scenariji:

- ukradena aktivna sesija MFA-disabled SuperAdmina može promijeniti zaštitu login endpointa bez novog dokaza prisustva;
- registry outage tokom emergency reseta ostavlja dio starih sesija aktivnim iako je account flag već promijenjen;
- klijent može unaprijed dobiti marker za `rate-limits-change` ili `bulk-password-reset`; naknadna role promjena u dvominutnom prozoru nije vezana za marker;
- uklanjanje/revokacija credentiala nakon assertiona ne invalidira već kreiran marker;
- konkurentna dodjela SuperAdmin uloge između bulk selekcije i updatea može zahvatiti račun koji politika namjerava izuzeti;
- dugi journal string filteri mogu nepotrebno opteretiti parser/DB i stvarati volumetrijski abuse na privilegovanoj ruti.

## 7. Async/integracije i operativnost

Modul nema vlastiti queue/worker. To je prihvatljivo za kratke passkey i settings tokove, ali nije dovoljno za fleet-wide emergency revokaciju. Bulk reset treba durable operation state, per-target idempotency/retry i jasan terminalni `PARTIAL/FAILED/SUCCEEDED` status.

Postoje warning logovi za bulk revocation/cache kvar, ali bez operation ID-a i target-safe korelacije. Rate-limit audit kvar nema log ni metric. Nema metrike za step-up reject/bypass branch, marker consume race, bulk partial/retry backlog ili auth-audit write failure. Webhook delivery operativnost ostaje za modul 10.

## 8. Testovi i izvršeni gateovi

### 8.1. Postojeći dokazi

Direktni specovi pokrivaju:

- passkey UV, no-credential, assertion failure, RP failure, purpose/session isolation i single-use;
- rate-limit bounds, cross-field validaciju, passkey/TOTP i settings batch;
- bulk eligibility, SuperAdmin izuzeće, idempotency, revocation, partial count, privacy-clean audit i swallowed cache/audit failure;
- controller guard metadata, journal mapping i metric/status odgovore.

E2E 37/39 dokazuju session/MFA/revocation osnove; E2E 46 pravi realnu WebAuthn ceremoniju virtualnim authenticatorom; E2E 47 dokazuje UI update, bounds, identity dialog, primjenu limita bez restarta, 429 i metric. Ne pokrivaju MFA-disabled SuperAdmin rate-limit write, caller-controlled privileged purpose, role/credential epoch, bulk registry outage recovery, konkurentnu role promjenu ni audit outage.

### 8.2. Lokalni rezultat

Izvršeno:

```bash
cd backend
npx jest --runInBand --runTestsByPath $(find src/modules/security -name '*.spec.ts' -print | sort)
```

Rezultat: **6/6 suiteova compile-blocked, 0 testova izvršeno**. Uzrok je nedostajući `src/generated/prisma/client`, pa `PrismaService` nema generated modele (`user`, `userPasskeyCredential`, `appSetting`, `auditLog`, `$executeRaw`). Ovo je environment-blocked, nije test failure niti pass.

Širi regex poziv `npx jest --runInBand src/modules/security` uključio je i prefiksni sibling `security-audit-webhook`: 1/8 suiteova prošao, 7 compile-blocked, 5/5 izvršenih testova prošlo. To nije direktni security suite rezultat.

Korisnik je potvrdio prolaz kompletne aktuelne CI/Playwright kolekcije 01–56. Taj dokaz potvrđuje postojeće scenarije, ali ne zatvara novootkrivene negativne/race scenarije.

## 9. Pozitivni nalazi

1. Sve administrativne rute imaju session + role guard i eksplicitni SuperAdmin zahtjev.
2. Legacy token bez registry session ID-ja ne može koristiti passkey marker.
3. Passkey assertion zahtijeva user verification i verifier veže assertion za subject/RP/challenge.
4. Challenge i confirmation marker su purpose/session scoped i single-use.
5. Bulk reset strožije fail-closed odbija administratora bez dostupnog drugog faktora.
6. Bulk reset ne zapisuje niti generiše password/hash i filtrira directory/anonymized račune.
7. Rate-limit scalar bounds, cross-field pravila i batch settings write su centralizovani.
8. Loader na settings kvar koristi poznati default umjesto proizvoljno slabije vrijednosti.
9. Journal repository čvrsto ograničava namespace na `auth.*` i koristi cursor paginaciju.
10. Metrics/webhook status su agregatni, SuperAdmin-only i `Cache-Control: no-store`.
11. Bulk audit metadata sadrži samo zbirne countove.

## 10. Registar nalaza

| ID             | Severity | Nalaz                                                      | Status   |
| -------------- | -------- | ---------------------------------------------------------- | -------- |
| BA-security-01 | P1       | MFA-disabled SuperAdmin mijenja rate limite bez step-upa   | otvoreno |
| BA-security-02 | P1       | Bulk reset ostavlja aktivne sesije nakon parcijalnog kvara | otvoreno |
| BA-security-03 | P1       | Privilegovani auth audit je best-effort i može nestati     | otvoreno |
| BA-security-04 | P2       | Klijent sam mintuje capability purpose                     | otvoreno |
| BA-security-05 | P2       | Marker nije vezan za credential/authorization epoch        | otvoreno |
| BA-security-06 | P2       | Bulk eligibility ima TOCTOU sa role/identity promjenom     | otvoreno |
| BA-security-07 | P2       | Bulk nema durable operation/retry manifest                 | otvoreno |
| BA-security-08 | P2       | Journal identifikatori nemaju maksimalne granice           | otvoreno |
| BA-security-09 | P2       | Kritične concurrency/failure grane nemaju test dokaz       | otvoreno |
| BA-security-10 | P3       | Step-up start nema zaseban abuse limit                     | otvoreno |
| BA-security-11 | P3       | Failure observability nema korelaciju/metrike              | otvoreno |

## 11. Detaljni nalazi

### BA-security-01 — MFA-disabled SuperAdmin mijenja rate limite bez step-upa

**Severity/status:** P1, otvoreno.  
**Dokaz:** `SecurityRateLimitsService.update`; kada marker ne postoji i `mfaService.isEnabled` vrati `false`, verifier se preskače i settings write se izvršava.  
**Uticaj/root cause:** ukradena već autentificirana sesija može oslabiti login zaštitu bez svježeg dokaza identiteta; uslov je implementiran kao opcioni fallback umjesto obavezne disjunkcije.  
**Korekcija:** identičan fail-closed policy kao bulk reset: passkey ili validan TOTP, a bez faktora eksplicitni `IDENTITY_CONFIRMATION_REQUIRED`; razmotriti obaveznu MFA politiku za SuperAdmin.  
**Acceptance:** service/controller/E2E test dokazuje 401/403 i nula settings/audit writeova za no-factor caller.  
**Owner/veličina/zavisnosti:** security + authentication, S; BA-authentication MFA policy.

### BA-security-02 — Bulk reset ostavlja aktivne sesije nakon parcijalnog kvara

**Severity/status:** P1, otvoreno.  
**Dokaz:** `updateMany` flagova prethodi per-user `sessionRegistry.revokeAll`; exception samo povećava `failedUsers`, a HTTP odgovor ostaje 200.  
**Uticaj/root cause:** upravo tokom incidenta kompromitovana postojeća sesija može nastaviti raditi; DB flag i registry side effect nemaju fail-closed/durable koordinaciju.  
**Korekcija:** durable operation/outbox, per-target stanje i retry; response `202`/operation status ili eksplicitni non-success za parcijalno stanje; enforcement sloj treba blokirati flagged principal i prije registry cleanup-a.  
**Acceptance:** injected registry outage ostavlja target odmah neupotrebljivim ili durable pending retry koji konvergira; nema lažnog terminalnog uspjeha.  
**Owner/veličina/zavisnosti:** security + authentication/session registry, L.

### BA-security-03 — Privilegovani auth audit je best-effort i može nestati

**Severity/status:** P1, otvoreno.  
**Dokaz:** rate-limit i bulk `audit` hvataju sve greške; bulk nema garantovan zbirni događaj, a rate-limit auth događaj nije u settings transakciji.  
**Uticaj/root cause:** forenzički trag kritične promjene ili emergency akcije može izostati baš kada audit storage zakaže. Postojeći settings/session zapisi nisu ekvivalentan kompletan aggregate auth događaj.  
**Korekcija:** transactional outbox/durable pending audit sa idempotency keyem; alarm i reconciliation; definisati da li kritični write fail-closed ili durable-accept.  
**Acceptance:** audit outage ne gubi događaj; nakon oporavka tačno jedan koreliran zapis postoji.  
**Owner/veličina/zavisnosti:** security + audit-log, M/L; BA-audit-log-03/06.

### BA-security-04 — Klijent sam mintuje capability purpose

**Severity/status:** P2, otvoreno.  
**Dokaz:** oba identity DTO-a prihvataju proizvoljan trimovan string do 64 znaka; nema server-side enum/intent issuance.  
**Uticaj/root cause:** svaki session može unaprijed mintovati marker za interni privilegovani action purpose; consumer guard trenutno sprječava neposredan bypass, ali capability nije izdat nakon authorization provjere i postaje opasan uz role promjenu ili novi consumer.  
**Korekcija:** server-owned purpose enum i action-specific start endpoint/ticket koji provjerava permission prije challengea.  
**Acceptance:** nepoznat purpose i privilegovani purpose bez aktuelne role su odbijeni; consumer prihvata samo server-issued intent.  
**Owner/veličina/zavisnosti:** security + authorization, M.

### BA-security-05 — Marker nije vezan za credential/authorization epoch

**Severity/status:** P2, otvoreno.  
**Dokaz:** marker value je credential row ID, ali `consumeFreshConfirmation` provjerava samo postojanje; ne provjerava credential status, subject, role/security epoch ili session revocation epoch.  
**Uticaj/root cause:** uklonjen credential ili promijenjena privilegija ne invalidira marker u preostalom TTL-u.  
**Korekcija:** signed/structured marker sa subject, credential ID, issued-at, auth/role epochom; potrošnja atomski provjerava aktuelne epochove ili event invalidira markere.  
**Acceptance:** credential removal, role change i session revocation između verify/consume uzrokuju fail-closed.  
**Owner/veličina/zavisnosti:** security + authentication + authorization, M.

### BA-security-06 — Bulk eligibility ima TOCTOU sa role/identity promjenom

**Severity/status:** P2, otvoreno.  
**Dokaz:** `findMany` učita role pa ih servis filtrira u memoriji; kasniji `updateMany` filtrira samo ID i flag.  
**Uticaj/root cause:** račun koji u međuvremenu postane SuperAdmin/directory/anonymized može biti označen i sesije opozvane, suprotno dokumentovanoj politici.  
**Korekcija:** eligibility uslov ponoviti u atomskom update/select toku, koristiti transakciju/locking ili eksplicitnu policy snapshot semantiku.  
**Acceptance:** konkurentna role/identity promjena ima determinističan rezultat i nikad ne zahvata zaštićenog SuperAdmina po odabranoj politici.  
**Owner/veličina/zavisnosti:** security + users/RBAC, M.

### BA-security-07 — Bulk nema durable operation/retry manifest

**Severity/status:** P2, otvoreno.  
**Dokaz:** jedini trag parcijalnosti je response count i warning; nema operation ID-ja, target statusa, queuea ili scheduled reconciliationa.  
**Uticaj/root cause:** restart ili gubitak odgovora briše znanje o korisnicima čija revokacija nije uspjela; ručni repeat je nedokazan operativni workaround.  
**Korekcija:** durable operation + per-target hashed/ID state, idempotent worker, retry/backoff/dead-letter i status endpoint/runbook.  
**Acceptance:** restart usred operacije nastavlja rad, a operator vidi terminalni status bez PII curenja.  
**Owner/veličina/zavisnosti:** security + integration queue, L.

### BA-security-08 — Journal identifikatori nemaju maksimalne granice

**Severity/status:** P2, otvoreno.  
**Dokaz:** `cursor`, `action` i `userId` imaju `MinLength(1)`, ali ne `MaxLength`; action regex ograničava prefiks, ne ukupnu veličinu.  
**Uticaj/root cause:** privilegovani ili kompromitovani caller može slati velike query stringove/DB parametre; cursor parser ugovor nije bounded.  
**Korekcija:** razumna poljska i ukupna URL granica, UUID/action schema, signed bounded cursor.  
**Acceptance:** oversized/malformed vrijednosti daju 400 prije repository poziva.  
**Owner/veličina/zavisnosti:** security + audit-log, S.

### BA-security-09 — Kritične concurrency/failure grane nemaju test dokaz

**Severity/status:** P2, otvoreno.  
**Dokaz:** nema testa za no-MFA rate-limit branch, purpose/role epoch, marker verify-consume race, bulk TOCTOU, process restart, durable audit ili registry recovery; lokalno je svih 6 suiteova compile-blocked.  
**Uticaj/root cause:** najrizičnije garancije su komentari i happy-path mockovi, ne izvršeni DB/Redis dokazi.  
**Korekcija:** generated Prisma CI gate, Postgres/Redis integration harness i ciljane race/failure E2E matrice.  
**Acceptance:** navedene grane deterministički prolaze u CI-u sa stvarnim storage adapterima.  
**Owner/veličina/zavisnosti:** QA/platform + security, L.

### BA-security-10 — Step-up start nema zaseban abuse limit

**Severity/status:** P3, otvoreno.  
**Dokaz:** identity start/verify kontroler nema route throttling; autentificirani caller može često prepisivati challenge i pokretati DB/RP rad.  
**Uticaj/root cause:** session compromise ili buggy UI može stvarati load i rušiti paralelne ceremonije istog session/purpose para.  
**Korekcija:** per-session/user bounded start/verify budget i metrike, uz UX-tolerantan limit.  
**Acceptance:** burst prelazi u 429 bez uticaja na druge sesije, normalna WebAuthn ceremonija ostaje funkcionalna.  
**Owner/veličina/zavisnosti:** security + authentication limiter, S/M.

### BA-security-11 — Failure observability nema korelaciju/metrike

**Severity/status:** P3, otvoreno.  
**Dokaz:** bulk warning nema operation/request ID ni metric; rate-limit audit catch je potpuno nijem.  
**Uticaj/root cause:** operator ne može pouzdano alarmirati, korelirati ni dokazati oporavak parcijalnog incident toka.  
**Korekcija:** strukturirani event/metric sa ne-PII operation ID-jem, failure classom, backlogom i alert pragom.  
**Acceptance:** injected kvar aktivira metriku/alert i može se pratiti do durable operacije/audit događaja.  
**Owner/veličina/zavisnosti:** security + observability, S/M.

## 12. Baseline score

| Presjek                      |   Težina |      Ocjena | Obrazloženje                                                                 |
| ---------------------------- | -------: | ----------: | ---------------------------------------------------------------------------- |
| A. Arhitektura i granice     |      10% |        8,70 | mali, kohezivan modul i reuse zajedničkih servisa                            |
| B. API i ugovori             |      12% |        8,00 | jasne rute/DTO-i; journal length i partial-status dug                        |
| C. Auth/authz/scope          |      15% |        5,00 | dobri guardovi, ali P1 no-MFA step-up bypass                                 |
| D. Poslovna pravila/stanje   |      13% |        6,00 | bounds/idempotency dobri; purpose/epoch i bulk state rupe                    |
| E. Podaci/Prisma/transakcije |      13% |        4,80 | bulk i audit side effecti nisu atomarni/durable                              |
| F. Sigurnost/privatnost      |      12% |        5,50 | jaka agregacija/UV; incident i audit P1 rizici                               |
| G. Async/integracije         |       8% |        5,50 | nema durable bulk retry/outboxa                                              |
| H. Testovi/dokazivost        |      10% |        5,00 | kvalitetni specovi/E2E, ali kritične grane nedostaju i 6/6 lokalno blokirano |
| I. Operativnost/perf.        |       7% |        6,00 | no-store/defaulti dobri; slaba failure observability/abuse zaštita           |
| **Ukupno**                   | **100%** | **6,00/10** | otvoreni P1 cap nije aktivirajući jer ponder već daje nižu ocjenu            |

## 13. Fazni plan popravki

### Faza 0 — reprodukcija i safety net

- Dodati no-MFA rate-limit negativni test, bulk registry/audit outage integration test, purpose/epoch i TOCTOU race testove.
- Osigurati generated Prisma klijent u hermetičkom CI jobu i izvršiti svih 6 direktnih suiteova.
- Ulaz: BA-security-01–11; rollback: samo testovi/fixturei; acceptance: svaki P1 prvo reproduciran.

### Faza 1 — P1 sigurnost i integritet

- Ujednačiti rate-limit i bulk fail-closed identity policy.
- Uvesti durable bulk operation/outbox i immediate enforcement za flagged principal.
- Uvesti durable/idempotent audit delivery za oba privilegovana write toka.
- Migracijski rizik: postojeći UI očekuje sync 200; planirati kompatibilni operation response.
- Rollback: feature flag na novi orchestrator uz zadržavanje strožeg step-upa; nikad rollback na no-factor write.

### Faza 2 — capability i API ugovori

- Server-owned purpose/intent registry, action permission provjera i marker epoch envelope.
- Bounded journal DTO/cursor i eksplicitni partial/operation status model.
- Acceptance: nepoznat/neautorizovan purpose i oversized query fail-fast.

### Faza 3 — podaci i konkurencija

- Atomizovati eligibility policy sa update snapshotom ili lockingom.
- Dodati operation/per-target schema, unique idempotency key, retry state i retention.
- Testirati role/identity promjenu tokom bulk procesa na stvarnom PostgreSQL-u.

### Faza 4 — async/integracije

- Worker retry/backoff/dead-letter/reconciliation za session revoke, cache i audit outbox.
- Definisati ordering: block/flag → revoke → invalidate → audit completion.
- Restart/failover rehearsal i operator retry/runbook.

### Faza 5 — testovi, observability i performanse

- Step-up abuse limiter; structured metrics/logs i alerti.
- Redis atomic consume/concurrency, revoked credential/role epoch, multi-instance settings i large-fleet bulk load testovi.
- E2E 37, 39, 46, 47 plus novi no-MFA, partial/recovery i authorization-intent scenariji.

### Faza 6 — dokumentacija i finalni gate

- Ažurirati API/runbook/threat model i consumer ugovore.
- Pokrenuti lint, build, svih 6 direktnih suiteova, povezane authentication/settings/audit suiteove i E2E matricu.
- Ponoviti audit ocjenu tek na finalnom SHA-u; modul se zatvara samo uz traceability dokaz.

## 14. Rizik, rollback i acceptance

### Rizik implementacije

Najveći rizik je prelazak bulk endpointa sa kratkog sync odgovora na durable operaciju i promjena UI ugovora. Epoch vezivanje može invalidirati aktivne step-up dijaloge, što je sigurnosno prihvatljivo ali mora imati jasan retry UX. Outbox uvodi migraciju i worker ownership. Role locking ne smije stvoriti deadlock sa RBAC writeovima.

### Rollback

- schema se uvodi additive, zatim dual-write, pa worker cutover;
- stari response može privremeno sadržati kompatibilne countove uz novi `operationId`;
- outbox/worker se može pauzirati bez gubitka pending reda;
- marker v2 može čitati samo v2 za privilegovane akcije, dok default identity-confirmation migrira kontrolisano;
- nikad ne vraćati no-MFA fail-open niti brisati pending operacije pri rollbacku.

### Globalni acceptance

1. Svaka rate-limit promjena ima svjež passkey/TOTP dokaz, bez no-factor izuzetka.
2. Bulk akcija nikada ne ostavlja kompromitovanu sesiju efektivno autorizovanom zbog registry kvara.
3. Svaki privilegovani write proizvodi tačno jedan durable, koreliran audit događaj.
4. Purpose izdaje server nakon action authorization provjere.
5. Credential, role i session revocation invalidiraju nepotrošen marker.
6. SuperAdmin exclusion je race-safe i dokumentovano deterministična.
7. Parcijalni bulk rad preživljava restart i konvergira ili završava vidljivim terminalnim failureom.
8. Query, challenge i bulk rad imaju jasne boundove i observability.
9. Svi ciljani unit/integration/E2E testovi prolaze na finalnom SHA-u.

## 15. Traceability

| Nalaz          | Kod/dokaz                            | Test prihvata                            | Faza    |
| -------------- | ------------------------------------ | ---------------------------------------- | ------- |
| BA-security-01 | `SecurityRateLimitsService.update`   | no-factor write fail-closed              | 0–1     |
| BA-security-02 | bulk update + revoke petlja          | registry outage immediate block/recovery | 0–1/3/4 |
| BA-security-03 | oba `audit` catch bloka              | audit outage outbox/replay               | 0–1/4   |
| BA-security-04 | identity purpose DTO/controller      | unknown/unauthorized intent              | 0–2     |
| BA-security-05 | confirmation marker/consume          | credential/role/session epoch            | 0–2     |
| BA-security-06 | `listEligibleUsers` + `updateMany`   | concurrent role/identity update          | 0–3     |
| BA-security-07 | bulk response/log-only partial state | restart/retry/dead-letter                | 0–4     |
| BA-security-08 | `SecurityAuditLogQueryDto`           | oversized/malformed 400                  | 0–2     |
| BA-security-09 | 6 specs + E2E 37/39/46/47            | full storage-backed matrix               | 0–6     |
| BA-security-10 | identity start/verify routes         | isolated 429 burst test                  | 0–5     |
| BA-security-11 | swallowed audit/warning logs         | metric/alert/correlation                 | 0–5     |

## 16. Konačna audit presuda i otvorene pretpostavke

Modul je arhitektonski razumljiv i ima značajne pozitivne sigurnosne kontrole, ali nije spreman za enterprise incident-response ocjenu iznad 6,00 dok step-up nije bezuslovno fail-closed, emergency revocation durable i audit trag garantovan. Popravke ostaju odgođene do završetka svih 43 modula, cross-cutting audita i konsolidovanog plana.

Pretpostavke:

- Session guard i role guard ponašanje oslanjaju se na završene audite 01–03; ovdje su ponovo provjerene njihove direktne upotrebe, ne cijela implementacija.
- Redis challenge store atomic `consume` je potvrđen pregledom adaptera; distributed failover/eviction nije lokalno integracijski izvršen.
- Korisnikov potvrđeni CI/Playwright prolaz važi za postojeću kolekciju, ne za nove acceptance scenarije.
- Webhook status privacy je pregledan na security read granici; delivery, SSRF, signing, retry i secret lifecycle ocjenjuje modul 10 — `security-audit-webhook`.
