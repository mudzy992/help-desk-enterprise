# Backend audit 31 — `install`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **4,02/10**  
**Nalazi:** 6 P1, 11 P2, 4 P3

## 1. Executive summary

`install` je bootstrap control plane: setup gate, founder SUPER_ADMIN, identitet, login provider/LDAPS, SMTP, minimalni seed/routing/SLA/forms, team accounts, profile/blueprints/policy packs/add-ons, Full settings sections, readiness, completion i ops rerun. Pozitivna osnova je opsežna: wizard je zatvoren bez `INSTALL_TOKEN`, token se poredi timing-safe, status je jedini javni pre-completion read, nakon completiona su osjetljivi install read/write putevi zaključani, founder password koristi aktuelnu policy provjeru i hash, seed/blueprint koriste transakcije i domenske funkcije, readiness blokira completion, completion generiše JWT secret i auditira promjenu.

Baseline je **4,02/10**. Šest P1 nalaza pogađaju bootstrap authorization, konkurentnost i atomarnost. Jedan statični bearer token od minimalno 16 znakova daje anonimnom klijentu cijelu pre-auth mutation površinu, uključujući kreiranje prvog SUPER_ADMIN-a, bez rate limita, expiryja, source restrictiona ili per-step capabilityja. Rerun sa istim tokenom i env prekidačem može bez sesije/MFA ponovo otvoriti završenu produkciju i globalni setup gate time oboriti aplikaciju. Founder create nema DB invariant „tačno jedan SUPER_ADMIN“ niti serializable lock, pa paralelne transakcije mogu obje proći pre-check. Login-provider i SMTP zapisuju više sigurnosno zavisnih postavki sekvencijalno bez jedne transakcije. Team batch kreira account, šalje/prikazuje credential i tek zatim dodaje grupu; parcijalni kvar ostavlja orphan/priviligovanog korisnika. Minimalni seed commit-a strukturu pa izvan transakcije seeduje default role-permission mapu; kvar ostavlja „spreman“ sadržaj sa neispravnim RBAC-om.

Dodatni rizici su dormant secrets pri promjeni providera/gašenju SMTP-a, process-local SMTP test limiter, setup status enumeration, N+1 i race u readinessu, rerun bez maintenance leasea, nepotpuna privacy/retention matrica i 39/54 compile-blokiranih suiteova. Nema P0. Popravke nisu implementirane.

## 2. Scope i inventar

- 208 produkcijskih TypeScript fajlova;
- 54 direktna speca;
- 12.774 aktuelnih produkcijskih LOC;
- 7 controllera i 19 registarskih injectable komponenti i 2 globalna/route guarda;
- nema jednog vlastitog modela: upravlja users/roles/settings/OU/groups/catalog/forms/routing/SLA i change-log zapisima;
- integracije: authentication/password policy, settings/secrets, RBAC, users/groups, service catalog, routing, SLA, templates/policy packs, SMTP, health/branding i globalni request gate;
- primarni E2E dokaz: 51, 52 i 53.

Registarskih 12.982 LOC korigovano je direktnim brojanjem na 12.774; registarski broj injectable komponenti ostaje 19.

## 3. Bootstrap trust boundary i install token

Prije completiona svi `/install/**` putevi osim `/install/status` traže `x-install-token`. Bez konfigurisanog tokena wizard je fail-closed. Token se trimuje, SHA-256 digest poredi timing-safe i minimalna dužina je 16 znakova. To rješava first-visitor takeover bez tokena.

Ipak token je dugovječan globalni bearer bez identiteta, expiryja, nonce/replay zaštite, per-step capabilityja, rate limita, IP/network allowlista ili obavezne rotacije nakon completiona. Posjednik može čitati konfiguracijske statuse, kreirati founder SUPER_ADMIN-a, mijenjati auth/SMTP i seedovati sistem. Minimalnih 16 korisnički odabranih znakova ne garantuje entropiju. Nema audit actora za sam token; mutation se pripisuje founderu čak kada zahtjev šalje druga osoba.

Bootstrap treba koristiti jednokratni visokentropijski challenge prikazan samo lokalnom operatoru, hashed state sa kratkim TTL-om, attempt limiterom, source restrictionom i capability progressionom. Nakon founder createa preostali koraci trebaju zahtijevati founder sesiju + CSRF/MFA, ne nastaviti kao anonimni bearer workflow.

## 4. Completion lock i ops rerun

Globalni `InstallSetupGuard` fail-closed blokira ostatak aplikacije dok `completedAt` nije validan. Install/health/ready/branding su izuzeti. Nakon completiona install guard zaključava gotovo sve read/write puteve; status i add-on katalog ostaju javni, completion je idempotentan, restart traži token i `INSTALL_ALLOW_RERUN=true`.

Rerun ipak ostaje anonimna bearer operacija. Ako env switch ostane uključen i token procuri, `POST /install/restart` briše completion markere. Globalni setup guard odmah vraća `SETUP_REQUIRED` skoro cijeloj produkciji, dok se wizard mutation površina ponovo otvara. Nema aktivne SUPER_ADMIN sesije, MFA/re-autha, dual controla, maintenance window leasea ni automatskog rollback timeouta. Change-log actor se heuristički postavlja na founder account, što lažno pripisuje operaciju osobi koja možda nije poslala zahtjev.

Rerun treba biti CLI/offline ili SUPER_ADMIN+MFA endpoint sa kratkotrajnim maintenance leaseom, reasonom, auditiranim stvarnim actorom, health alarmom i automatskim relockom ako completion ne uspije.

## 5. Founder SUPER_ADMIN i concurrency

Credentials se normalizuju i provjeravaju prema password policyju; hash ne smije biti plaintext; founder je local-only i kreira se sa SUPER_ADMIN roleom u transakciji. Email conflict se provjerava, a JWT secret nastaje na completionu.

`findInstallSuperAdmin` se poziva prije i unutar transakcije, ali nema DB constrainta koji garantuje samo jednog korisnika sa SUPER_ADMIN roleom niti advisory/serializable bootstrap locka. Dvije paralelne transakcije mogu obje vidjeti „nema founder-a“, koristiti različite e-mailove i obje commitovati SUPER_ADMIN membership. To je kritični privilege invariant.

Potrebna je singleton bootstrap row/DB advisory lock ili transakcija na serializable nivou sa DB invariantom. Founder create, internal-domain seed i bootstrap audit također trebaju biti jedna dokaziva saga; internal-domain seed se trenutno izvršava poslije user transakcije i grešku može progutati.

## 6. Login provider, SMTP i secret lifecycle

Status response ne vraća secret vrijednosti. Login provider čita postojeće secret-e samo internim putem, validation podržava zadržavanje postojećeg passworda, a settings domen radi validation/change-log/redaction. SMTP test koristi isti transport i ne vraća password.

`persistInstallLoginProvider` ipak radi 1–5 zasebnih `setSettingValue` operacija. Pad između tenant/client, LDAPS URL/DN/password i finalnog auth modea ostavlja parcijalnu konfiguraciju. Slično SMTP upisuje host/port/TLS/user/from/password/enabled sekvencijalno. Crash može uključiti SMTP sa starim credentialom ili ostaviti nov secret uz star endpoint. Ovo su sigurnosno povezani stateovi i moraju biti atomarni.

Promjena na local mode ne briše Entra/LDAP tenant, client, bind DN/password. Promjena između provider varijanti može ostaviti dormant secrets. Gašenje SMTP-a postavlja enabled/add-on false, ali ne briše host/user/password. Dormant credentials povećavaju blast radius i mogu se neočekivano ponovo aktivirati. Potrebna je transakcijska settings batch operacija sa dependency resetom i eksplicitnom retain/delete potvrdom.

SMTP test dopušta operatoru proizvoljnu validnu adresu, što je korisno, ali process-local limiter od 5/10 min nije distribuiran. Više instanci/restart zaobilazi limit. Greška može vratiti raw SMTP message; klasifikacija treba osigurati da server response nikad ne reflektuje credential ili osjetljivi endpoint detalj.

## 7. Seed, blueprint i RBAC atomarnost

Minimum seed unutar transakcije osigurava OU, handler grupu, founder membership, service/category/form, routing i provjerava stvarnu routing rezoluciju. Blueprint također transakcijski kreira kategorije/services/forms/groups/routing i završno provjerava pokrivenost. Operacije su uglavnom idempotentne.

Nakon što minimum transakcija commit-a, `seedDefaultRolePermissions(prisma)` se poziva izvan nje. Ako RBAC seed padne, struktura i route postoje, ali agent/admin permission mapping nije dovršen. Retry može popraviti, ali wizard i readiness mogu vidjeti djelimičan state. RBAC je dio minimum „sistem prima tikete“ invarianta i mora biti u istoj transakciji ili durable provisioning state machineu koji completion ne može zaobići.

Ensure funkcije često rade find-then-create/upsert po slug/key logici. Potrebno je dokazati concurrency na dva paralelna seed/blueprint zahtjeva; DB unique može spriječiti duplikat, ali raw conflict ili različito odabran postojeći fallback može dati nekonzistentan rezultat. Profile reset/blueprint/policy-pack marker također mora biti atomaran sa sadržajem koji tvrdi da je primijenjen.

## 8. Team provisioning

Team input je bounded i validiran; kreiranje koristi centralni users domain, aktuelnu password policy/temporary password delivery i centralni add-group-member. Email conflict je mapiran, a duplicate membership je idempotentan.

Batch ipak nije transakcijski. Za svakog člana account se kreira (i privremena lozinka može biti poslana ili vraćena klijentu), a tek zatim membership. Ako membership padne, account ostaje. Ako treći član padne, prva dva ostaju, ali cijeli request je error i retry nailazi na email conflict. Nema idempotency commanda, batch outcome registra, compensationa ni resume ugovora.

RoleKey iz inputa može kreirati privilegovan account prema dozvoljenoj install listi; bearer token operator tako širi privilege prije authenticated boundaryja. Potreban je transactional provisioning/outbox ili per-member idempotent state machine, minimalna dozvoljena početna uloga i eksplicitna potvrda privilegovanih članova.

## 9. Settings sections, add-ons i profile state

Full sections koriste registry allowlist, payload ceiling, server-side validation i `setSettingValues` batch; security recommendations su centralno deklarisane i ne uključuju captcha bez credentiala. Profile downgrade je blokiran kada bi uklonio već kreirane podatke, a markers/skip/readiness daju dobar workflow dokaz.

Ipak različiti koraci koriste različitu atomarnost: identity/sections koriste batch API, dok SMTP/login/add-ons često sekvencijalno pišu. Marker i domain content u policy-pack/SLA review koracima trebaju dokaz da su u istoj transakciji; marker-only success ne smije tvrditi da je external/domain apply uspio. Skipped marker je operator assertion, ne tehnički dokaz, pa readiness mora jasno razlikovati „deferred“ od „verified“.

Post-completion anonimni `GET /install/addons` otkriva enabled/catalog state. To vjerovatno nije visoko osjetljivo, ali endpoint bi trebao koristiti regularnu authenticated settings površinu ili vratiti samo javni minimalni feature manifest.

## 10. Readiness, completion i TOCTOU

Readiness provjerava founder, strukturu, routing, handler membership, SLA, profile steps i druge uslove. Completion ponovo čita readiness i transakcijski postavlja completion timestamp/actor te generiše JWT secret. Ponovljen completion ne mijenja timestamp.

Provjere i completion nisu jedna serializable transakcija. Između readiness readova i completion commita drugi paralelni install zahtjev može promijeniti provider, profile, routing ili marker. Install token nema single-writer lock. Dva operatora mogu paralelno izvršavati korake i completion, što daje stale readiness odluku. Potreban je wizard session/version, global install mutex i finalni invariant check pod istim lockom.

Readiness radi više odvojenih queryja i ponegdje učitava liste da bi brojio. Za install volumen je mali, ali greške mogu proizvesti nejasan false/partial status. Completion audit treba uključiti readiness hash/snapshot, package i verificirane/deferred korake.

## 11. Setup availability i error semantics

Globalni guard razlikuje poznatu DB unavailable grešku od ostalih; poznata vraća setup-database-unavailable, dok nepoznata completion-read greška izgleda kao setup required. To je fail-closed, ali može pogrešno preusmjeriti završenu produkciju u install UX tokom schema/client greške. Install token i DB i dalje sprečavaju mutation, ali operativna dijagnoza je zamagljena.

Health/ready exemption mora osigurati da readiness stvarno bude non-ready kada DB/setup nije dostupan; inače orchestrator može držati neupotrebljiv instance u rotaciji. Potrebni su setup-state metrički signal, alarm za dugo otvoren wizard i audit svakog rejected token/rerun pokušaja bez logovanja tokena.

## 12. Privacy, audit i retention

Founder/team imena i e-mailovi, SMTP/LDAP/Entra konfiguracija, temporary password outcome i install markers ulaze u više domena. Secrets su redigovani u settings change-logu, što je pozitivno. Međutim token pokušaji nemaju actor audit; rerun se pripisuje founderu/serveru; privremene lozinke se vraćaju jednom u API response i zahtijevaju strogu no-store/no-log garanciju na svim proxy slojevima.

Nema kompletne bootstrap retention matrice za completion/rerun markers, install change-log, dormant provider/SMTP secrets, failed team account, blueprint provenance i security recommendation evidence. INSTALL_TOKEN lifecycle poslije completiona nije tehnički obrisiv jer je env secret; runbook mora zahtijevati rotaciju/uklanjanje i potvrdu da restart zahtijeva novi maintenance secret.

## 13. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/install -name '*.spec.ts' -print | sort)
```

Rezultat: **15/54 suiteova prošlo, 39/54 compile-blocked; 68/68 izvršenih testova prošlo**. Nije zabilježen assertion failure. Blokade su prvenstveno nepotpun generated Prisma client (`user`, `appSetting`, `$transaction` i drugi delegati) i nedostajući `generated/prisma/enums`.

Zeleni pure/helper testovi potvrđuju dio token/lock/readiness/profile/validation pravila. E2E 51/52/53 prolaze kroz Minimum/Standard/Full happy path, completion lock i prvi routed ticket. Ne pokrivaju token brute-force/replay/rotation, paralelni founder, rerun takeover/outage, partial provider/SMTP write, team partial failure, RBAC post-commit failure, concurrent wizard/completion, multi-instance SMTP limiter ni dormant secret cleanup.

## 14. Pozitivni nalazi

1. Wizard je bez INSTALL_TOKEN-a fail-closed.
2. Token digest se poredi timing-safe.
3. Samo status je javni pre-completion read.
4. Osjetljivi install putevi se zaključavaju poslije completiona.
5. Founder koristi password policy, siguran hash i local-only invariant.
6. Secret statusi ne vraćaju vrijednosti.
7. Minimum seed i blueprint core su transakcijski i idempotentno dizajnirani.
8. Routing se završno provjerava stvarnom rezolucijom.
9. Team koristi centralni users/group domain.
10. Sections imaju registry allowlist i batch settings write.
11. Readiness blokira completion.
12. Completion atomarno generiše JWT secret i marker/change-log.
13. Rerun je default-off i traži eksplicitni env switch.
14. 68 izvršenih testova je zeleno.

## 15. Registar nalaza

| ID            | Severity | Nalaz                                                                                         | Status   |
| ------------- | -------- | --------------------------------------------------------------------------------------------- | -------- |
| BA-install-01 | P1       | Statični bearer token daje anonimni puni bootstrap/SUPER_ADMIN control plane bez TTL/limita   | otvoreno |
| BA-install-02 | P1       | Rerun sa tokenom+env bez sesije/MFA može otvoriti wizard i oboriti završenu produkciju         | otvoreno |
| BA-install-03 | P1       | Founder create nema DB singleton/serializable lock; paralelno mogu nastati dva SUPER_ADMIN-a  | otvoreno |
| BA-install-04 | P1       | Login-provider i SMTP sigurnosno povezane postavke pišu se neatomarno                         | otvoreno |
| BA-install-05 | P1       | Team batch nije idempotentan/atomaran; account/credential može ostati bez membershipa         | otvoreno |
| BA-install-06 | P1       | Minimum seed commit-a prije RBAC permission seeda i može ostaviti djelimično spreman sistem   | otvoreno |
| BA-install-07 | P2       | Provider/mode promjena i SMTP disable ostavljaju dormant bind/SMTP secret-e                   | otvoreno |
| BA-install-08 | P2       | Completion readiness i marker commit nemaju globalni wizard lock/version; TOCTOU je moguć     | otvoreno |
| BA-install-09 | P2       | Parallel seed/blueprint ensure putevi nemaju dokazanu conflict/retry semantiku                | otvoreno |
| BA-install-10 | P2       | Marker/content atomarnost nije konzistentna kroz profile/policy-pack/SLA/add-on korake        | otvoreno |
| BA-install-11 | P2       | SMTP test rate limit je process-local i reset/multi-instance ga zaobilazi                     | otvoreno |
| BA-install-12 | P2       | SMTP test može reflektovati raw provider poruku bez formalne secret-redaction garancije       | otvoreno |
| BA-install-13 | P2       | Setup status je anoniman i otkriva fazu/profil; nema abuse/cache budžet                       | otvoreno |
| BA-install-14 | P2       | Temporary password response nema dokazanu end-to-end no-store/no-log politiku                 | otvoreno |
| BA-install-15 | P2       | Unknown DB/client greška završenu produkciju prikazuje kao setup-required umjesto jasnog kvara | otvoreno |
| BA-install-16 | P2       | Bootstrap/rerun/token/dormant-secret privacy, audit i retention matrica nije potpuna           | otvoreno |
| BA-install-17 | P2       | Token nema obaveznu rotaciju/uklanjanje nakon completiona niti per-attempt security audit     | otvoreno |
| BA-install-18 | P3       | Anonimni post-completion add-on read otkriva interni feature state                            | otvoreno |
| BA-install-19 | P3       | Readiness koristi više odvojenih queryja i nema completion evidence hash                      | otvoreno |
| BA-install-20 | P3       | Nema setup-open duration/failed-token/rerun health metrike i alarma                           | otvoreno |
| BA-install-21 | P3       | 39/54 suiteova je compile-blockirano; ključna concurrency/failure matrica nedostaje           | otvoreno |

## 16. Ključne korekcije

- **01,17:** jednokratni visokentropijski bootstrap challenge, TTL, limiter, source restriction, rotation i security audit.
- **02:** authenticated SUPER_ADMIN+MFA/dual-control maintenance lease ili offline CLI rerun sa auto-relockom.
- **03:** DB singleton bootstrap/advisory lock i serializable founder transaction.
- **04,07:** atomski settings bundle + dependency secret reset/retain odluka.
- **05:** idempotent per-member provisioning state/transaction/outbox i compensation/resume.
- **06,09–10:** RBAC+seed+marker invariant u jednoj transakciji ili durable provisioning state machine sa readiness gateom.
- **08,19:** global wizard mutex/version i finalni readiness snapshot/hash pod istim lockom.
- **11–12:** Redis limiter i typed/redacted SMTP errors.
- **13–16,18,20:** minimalni status/add-on exposure, no-store/no-log dokaz, jasna DB failure semantika i bootstrap observability/retention.
- **21:** regenerisan Prisma client i real DB concurrency/fault/E2E matrica.

## 17. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,50 |
| B. API i ugovori             |    12% |   4,80 |
| C. Auth/authz/scope          |    15% |   3,20 |
| D. Poslovna pravila/stanje   |    13% |   4,50 |
| E. Podaci/Prisma/transakcije |    13% |   3,80 |
| F. Sigurnost/privatnost      |    12% |   3,40 |
| G. Async/integracije         |     8% |   3,80 |
| H. Testovi/dokazivost        |    10% |   3,50 |
| I. Operativnost/perf.        |     7% |   3,90 |
| **Ukupno**                   | **100%** | **4,02/10** |

Ponderisani zbir je 4,020, odnosno **4,02/10**. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 18. Fazni plan

### Faza 0 — safety net

Token brute/replay/rotation; dva founder createa; rerun takeover/timeout; provider/SMTP mid-write crash; team member membership failure; RBAC seed failure; concurrent completion; multi-instance SMTP test.

### Faza 1 — bootstrap identity i rerun safety

One-time challenge, founder session takeover nakon createa, DB singleton, MFA/dual-control maintenance lease i auto-relock.

### Faza 2 — atomic configuration i secret lifecycle

Transactional settings bundles, provider/SMTP dependency cleanup, typed error redaction i distributed limiter.

### Faza 3 — durable provisioning

Team idempotency/outbox, seed+RBAC invariant, marker/content state machine i concurrency retry.

### Faza 4 — completion evidence i operations

Wizard mutex/version, readiness evidence hash, setup/rerun metrics, no-store/no-log proof i retention/runbook.

### Faza 5 — finalni gate

Regenerisan Prisma client; svih 54 suitea; real Postgres concurrent founder/seed/completion, injected provider/team/RBAC failures, multi-instance limiter i E2E 51–53 na finalnom SHA-u.

## 19. Acceptance i konačna presuda

1. Bootstrap credential je jednokratan, kratkotrajan, rate-limited i uklonjen nakon founder takeovera.
2. DB garantuje tačno jednog founder SUPER_ADMIN-a pod concurrencyjem.
3. Rerun ne može anonimno oboriti produkciju i automatski se relocka nakon timeouta.
4. Auth/LDAP/SMTP konfiguracija je atomska i dormant secret lifecycle eksplicitan.
5. Team retry nikad ne pravi orphan/dupli account niti gubi credential delivery stanje.
6. Seed, RBAC i marker zajedno daju jedan dokaziv provisioning invariant.
7. Completion se zasniva na istom zaključanom readiness snapshotu koji se auditira.
8. Temporary password/token/provider errors imaju end-to-end no-store/no-log/redaction dokaz.
9. Bootstrap observability i retention pokrivaju status, token attempts, rerun, secrets i provenance.
10. Svih 54 suitea i concurrency/failure/security E2E prolaze.

Modul ima impresivan workflow, dobar completion gate i širok happy-path dokaz, ali statični anonimni bootstrap/rerun trust, founder concurrency i neatomarne sigurnosne/provisioning operacije sprečavaju enterprise ocjenu. Iskren ponderisani baseline je **4,02/10**.
