# Backend audit 32 — `setup-checklist`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** srednji  
**Baseline ocjena:** **6,08/10**  
**Nalazi:** 0 P1, 7 P2, 4 P3

## 1. Executive summary

`setup-checklist` je mali post-install read model: iz install step/progress stanja i pet produkcijskih sigurnosnih preporuka gradi listu otvorenih obaveza, a jedina mutacija globalno zapisuje trenutak kada je dashboard widget odbačen. Modul ima jasnu granicu, nema vlastiti mutable item model, koristi centralni session/role/permission chain, privatnu settings definiciju i centralni auditirani settings writer. Ne izlaže secret vrijednosti i ne omogućava promjenu konfiguracije koju prikazuje.

Baseline je **6,08/10**. Nema P0/P1 nalaza. Najveći problem je semantika globalnog dismissal-a: jedan ADMIN sa `settings.write` trajno skriva widget svim administratorima, uključujući sigurnosne preporuke koje postanu neusklađene tek kasnije. Ne postoji undismiss, per-user acknowledgement, dismissed item-version/hash niti automatska reaktivacija kada se skup ili severity otvorenih stavki promijeni. Read authorization je istovremeno preširoko vezan za write capability i neusklađen sa dashboard capability provjerom. Derived status nasljeđuje coarse/stale install markere, dok captcha preporuka smatra bilo koji provider različit od `none` dovoljnim bez dokaza da su potrebni ključevi operativni.

Operativno, jedan dashboard GET pokreće široki install progress fan-out preko users/settings/OU/groups/services/routing i zatim dodatne recommendation reads. Nema checklist-specifičnog snapshot/version ugovora, pa payload može kombinovati stanja iz različitih trenutaka. Oba direktna suitea su compile-blockirana nepotpunim generated Prisma clientom; E2E 51/53 dokazuju prikaz stavki, ali ne authorization, dismissal, reaktivaciju, failure ili concurrency ponašanje. Popravke nisu implementirane.

## 2. Scope i inventar

- 6 produkcijskih TypeScript fajlova;
- 2 direktna spec fajla;
- 233 produkcijska LOC prema zaključanom inventaru;
- 1 controller, 1 injectable service, 1 module;
- 2 endpointa: `GET /setup-checklist`, `POST /setup-checklist/dismiss`;
- nema vlastitih Prisma modela, jobova, queuea, file/network I/O-a;
- zavisnosti: authentication, authorization, settings, install progress, users/groups/catalog/routing i install security recommendations;
- E2E dodir: 51 Minimum i 53 Full install wizard.

## 3. Arhitektura i state model

Items nisu pohranjeni. `buildSetupChecklistItems` deterministički spaja:

1. install korake gdje su `skipped=true` i `completed!==true`;
2. deklarisane security recommendations gdje `isApplied=false`.

To je dobra odluka: nema duplog izvora istine i obaveza nestaje kada stvarna konfiguracija postane zadovoljena. Registry redoslijed daje stabilan output, a response ne sadrži tajne ili PII. Jedino trajno stanje je privatni `private.install.checklistDismissedAt`.

Međutim, `completed` za više install koraka nije uvijek dokaz efektivnog runtime stanja. Blueprint/policy-pack/SLA/section/add-on tokovi koriste bookkeeping marker ili coarse status. Ako sadržaj naknadno bude uklonjen, konfiguracija degradira ili marker ostane nakon parcijalnog applyja, checklist može sakriti stvarno otvorenu obavezu. Modul slijepo nasljeđuje te install invariante i nema provenance/freshness signal.

## 4. Authentication i authorization

Controller koristi `SessionAuthenticationGuard` i `RoleGuard`, zahtijeva ADMIN rolu i `settings.write`. Dismiss dodatno čita stvarni principal subject i odbija anonimnu atribuciju. GET je označen kao admin read operation, dok POST nije dozvoljen u read-only modu. Module wiring eksplicitno uvozi Authentication/Authorization/Settings module.

Pozitivno je što checklist sadrži sigurnosno i setup stanje i nije javno dostupan. Ipak isti `settings.write` se traži i za čisti GET. To onemogućava read-only administratora ili budući setup/security viewer capability, a istovremeno svako ko smije mijenjati bilo koju settings kategoriju smije globalno utišati widget. Potrebna je posebna `setup-checklist.read` i `setup-checklist.dismiss` ili barem `settings.read`/eksplicitna globalna admin capability politika.

Frontend renderuje karticu prema `canOpenAdminArea`, dok backend zahtijeva konkretniji role+permission spoj. Korisnik može vidjeti skeleton/unavailable karticu i dobiti 403 iako frontend tvrdi da admin area postoji. E2E ne dokazuje capability matricu.

## 5. Dismissal semantika

`dismiss()` auditirano zapisuje ISO timestamp kroz centralni SettingsService i vraća svježi status. Items ostaju u responseu i dostupni su Settings površini, što je bolji izbor od brisanja obaveza.

Ipak dismissal je globalni deployment flag, ne preference konkretnog administratora. Jedna osoba skriva widget svima. Timestamp nema `dismissedBy` u responseu, nema expiry, nema item-set version/hash i nema API za vraćanje kartice. Najvažnije: frontend skriva karticu kad god je `dismissedAt !== null`; ako se poslije dismissal-a MFA isključi, HIBP ugasi, idle timeout oslabi ili novi deferred korak pojavi, nova stavka se izračuna ali dashboard ostaje skriven.

Sigurniji ugovor je per-user acknowledgement vezan za hash `{open item keys + policy version}`, sa automatskim reappearom na novu stavku, veću severity ili promjenu preporuke. Globalni suppression, ako je poslovno potreban, treba imati expiry, reason, stvarnog actora, privileged permission i vidljiv Settings control za reset.

Ponovljeni POST uvijek piše novi timestamp i change-log, iako je widget već dismissan i item set se nije promijenio. Nema idempotency key/CAS-a; paralelni klikovi daju last-write-wins timestamp i audit spam.

## 6. Sigurnosne preporuke

Checklist prikazuje pet install preporuka: admin MFA, optional MFA, HIBP, idle timeout 1800 i captcha provider. Vrijednosti se čitaju kroz centralni registry/validator i secret se ne čita.

`captcha` koristi `recommendedValue=null`, a `isApplied` vraća true čim je provider neprazan i nije `none`. Ne provjerava da postoje validni Turnstile site/secret ključevi, da je provider podržan ili da runtime challenge radi. Checklist tako može ukloniti captcha upozorenje za neoperativnu konfiguraciju.

Pet hardkodiranih preporuka nisu kompletan production security posture: nema break-glass provjere, token/session signing key healtha, SMTP/LDAPS TLS-a, audit retention/webhooka, backup/restore dokaza, trusted proxies/CORS-a ili dormant secreta. Naziv i UI moraju jasno reći da je riječ o ograničenom install checklistu, ne sigurnosnom compliance dokazu. Registry treba version, owner, severity, evidence resolver i lifecycle test.

## 7. Konzistentnost, concurrency i greške

`getStatus` paralelno čita dismissed timestamp i items. Items zatim učitavaju install progress, a recommendation status se čita poslije progressa. Settings request snapshot smanjuje broj DB čitanja, ali Prisma domain čitanja i settings nisu jedna snapshot transakcija. Response može kombinovati stari dismissal, novi skip marker, staru team/seed sliku i novu preporuku.

Za UX hint eventual consistency je prihvatljiva, ali API nema `evaluatedAt`, state version ili stale/error metadata. Bilo koja greška u širokom dependency chainu ruši cijeli checklist; jedna nedostupna OU/routing/team provjera sprečava prikaz nezavisnih sigurnosnih preporuka. Potrebna je parcijalna/fail-visible semantika: npr. `items`, `warnings`, `evaluatedAt`, `version`, uz jasno razlikovanje „compliant“, „open“ i „unknown“.

Dismiss write i naredni `getStatus` nisu jedna transakcijska operacija. To nije data-integrity rizik za timestamp, ali odgovor može prikazati item set drugačiji od onoga koji je korisnik upravo odbacio. Item hash u mutation inputu i optimistic CAS bi dao dokazivu namjeru.

## 8. Performance i cache

Dashboard GET koristi cijeli `readInstallStepProgress`: founder, identity, login provider, auth mode, SMTP, seed, team, blueprint, policy pack, SLA, add-ons, profile, sve skip i save markere. Neki helperi čitaju čitave male liste ili rade više domain queryja. Poslije toga recommendations rade dodatne settings reads.

Za mali deployment ovo je vjerovatno prihvatljivo, ali dashboard je hot path. Modul nema latency/query budget, checklist cache, ETag, conditional GET ili invalidation fokusiran na relevantne settings/domain evente. Shared settings snapshot pomaže samo settings dijelu i uglavnom je process-local/kratkotrajan. Potrebni su query count test, p95 budžet i event-driven/materialized read model ili kratki cache sa tačnom invalidacijom.

Payload je registry-bounded, pa pagination i request input limiti nisu potrebni. Server-generated i18n ključevi su mali i ne renderuju raw HTML.

## 9. Audit, privacy i retention

Dismissal koristi fiksni reason `setup_checklist_dismissed`; centralni settings writer evidentira actora i diff. Checklist response nema PII i ne vraća current/recommended vrijednosti, samo target/i18n keys.

Audit ipak ne bilježi koje su stavke bile otvorene, njihov severity/policy version ni item hash u trenutku dismissal-a. Naknadno nije moguće dokazati je li administrator svjesno prihvatio MFA/captcha gap ili samo zatvorio prazan/stari widget. Timestamp je globalno zadržan bez retention/expiry politike. Read access sigurnosnom postureu se ne auditira, što može biti prihvatljivo za dashboard, ali treba biti eksplicitna odluka.

## 10. Test dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  src/modules/setup-checklist/setup-checklist.controller.spec.ts \
  src/modules/setup-checklist/setup-checklist.service.spec.ts
```

Rezultat: **0/2 suitea izvršeno; oba compile-blockirana; 0 testova izvršeno**. Controller suite blokira nedostajući Prisma `appSetting` delegate; service suite blokiraju nedostajući `$transaction` i `user` delegate u generated Prisma clientu. Nema assertion failurea jer Jest nije stigao do izvršavanja testova.

Statički specovi namjeravaju dokazati guard metadata/module wiring, admin attribution, deferred SMTP/team behavior, recommendation disappearance i dismissal persistence. E2E 51 dokazuje da se dva deferred Minimum itema vide poslije login-a; E2E 53 dokazuje da se Full section item vraća iz API-ja. Ne postoje direktni dokazi za 401/403 sa stvarnim guardovima, read-only mode, dismiss E2E, per-user/global semantics, reappearance poslije nove stavke, concurrent dismiss, dependency failure, stale marker, captcha operativnost, query budget ili audit sadržaj.

## 11. Pozitivni nalazi

1. Mala, fokusirana i čitljiva modul granica.
2. Items su derived view, bez duplog mutable todo stanja.
3. Session, ADMIN role i permission guard su prisutni.
4. Dismiss zahtijeva atribuiranog principala.
5. GET je read-only označen, POST nije.
6. Privatni setting ide kroz centralni validator, transakciju, cache invalidation i change-log.
7. Nema secret/PII vrijednosti u responseu.
8. Registry daje stabilan redoslijed i bounded payload.
9. Stavka automatski nestaje kada njen efektivni resolver prijavi completion.
10. E2E 51/53 imaju happy-path dokaz prikaza.

## 12. Registar nalaza

| ID                      | Severity | Nalaz                                                                                                  | Status   |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------ | -------- |
| BA-setup-checklist-01   | P2       | Jedan admin globalno i trajno skriva widget svim administratorima, uključujući buduće otvorene stavke  | otvoreno |
| BA-setup-checklist-02   | P2       | Nema per-user/item-version acknowledgementa, expiryja, undismissa ni automatske reaktivacije           | otvoreno |
| BA-setup-checklist-03   | P2       | Čisti GET traži `settings.write`; read/write capability i frontend admin gate nisu usklađeni           | otvoreno |
| BA-setup-checklist-04   | P2       | Derived items nasljeđuju stale/coarse install markere i mogu lažno nestati                             | otvoreno |
| BA-setup-checklist-05   | P2       | Captcha se smatra primijenjenom samo po provider stringu, bez ključeva/runtime health dokaza           | otvoreno |
| BA-setup-checklist-06   | P2       | Dashboard GET pokreće širok install/domain fan-out bez query/latency budžeta ili ciljanog cachea        | otvoreno |
| BA-setup-checklist-07   | P2       | Dependency greška ruši cijeli status; nema partial/unknown/freshness semantike                          | otvoreno |
| BA-setup-checklist-08   | P3       | Dismiss audit nema item hash, otvorene stavke, policy version ni korisnički reason                      | otvoreno |
| BA-setup-checklist-09   | P3       | Ponovljeni/paralelni dismiss nije idempotentan i pravi last-write-wins timestamp/audit spam             | otvoreno |
| BA-setup-checklist-10   | P3       | DismissedAt i items nisu konzistentan snapshot; nema evaluatedAt/version/ETag                           | otvoreno |
| BA-setup-checklist-11   | P3       | Oba direktna suitea su compile-blockirana, a security/concurrency/failure E2E matrica nedostaje         | otvoreno |

## 13. Ključne korekcije

- **01–02:** per-user acknowledgement vezan za item/policy hash; reappear na novoj/regresiranoj stavci; expiry i reset control.
- **03:** posebne read/dismiss capability dozvole i zajednički frontend/backend capability resolver.
- **04–05:** evidence-based resolver po stavci; provjera stvarnog domain/runtime stanja i kompletnih captcha credentiala.
- **06–07:** checklist read model/cache sa event invalidacijom, query/p95 budžetom i partial `unknown` statusom.
- **08–10:** mutation input sa item hashom/reasonom, CAS/idempotency, audited snapshot i response version/evaluatedAt.
- **11:** regenerisan Prisma client; real guard, dismissal/reactivation, fault, concurrency i performance testovi.

## 14. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   7,00 |
| B. API i ugovori             |    12% |   6,50 |
| C. Auth/authz/scope          |    15% |   6,50 |
| D. Poslovna pravila/stanje   |    13% |   6,00 |
| E. Podaci/Prisma/transakcije |    13% |   6,00 |
| F. Sigurnost/privatnost      |    12% |   6,00 |
| G. Async/integracije         |     8% |   6,50 |
| H. Testovi/dokazivost        |    10% |   4,00 |
| I. Operativnost/perf.        |     7% |   6,00 |
| **Ukupno**                   | **100%** | **6,08/10** |

Ponderisani zbir je 6,075, zaokružen na **6,08/10**.

## 15. Fazni plan

### Faza 0 — safety net

Regenerisati Prisma client; pokriti real 401/403/read-only guard, dismiss E2E, dvije admin sesije, novu stavku poslije dismissal-a, captcha bez ključeva, dependency failure i query count.

### Faza 1 — acknowledgement i authorization

Uvesti per-user item/policy hash acknowledgement, reactivation/expiry/undismiss i posebne read/dismiss capabilities usklađene sa frontend resolverom.

### Faza 2 — evidence model

Svakoj stavci dati owner, severity, evidence resolver i policy version; ukloniti oslanjanje na stale marker gdje se efektivno stanje može provjeriti; captcha zahtijeva kompletan operativni dokaz.

### Faza 3 — read model i resilience

Materializovati ili kratko cacheirati bounded checklist, invalidirati relevantnim settings/domain eventima, vratiti `unknown` po porodici umjesto rušenja cijelog statusa i postaviti p95/query budžet.

### Faza 4 — audit i concurrency

Dismiss prima item hash i reason, koristi CAS/idempotency i auditira otvorene stavke/policy version; response dobija `evaluatedAt`, `version` i eventualno ETag.

### Faza 5 — finalni gate

Oba direktna suitea zelena; E2E 51/53 plus authorization/dismiss/reactivation; fault/concurrency/performance matrica i cross-instance invalidation dokaz na finalnom SHA-u.

## 16. Acceptance i konačna presuda

1. Dismissal jednog administratora ne utišava nove/regresirane stavke niti preference drugih administratora.
2. Read i dismiss imaju najmanje potrebne, eksplicitne capability dozvole usklađene s frontendom.
3. Svaka stavka ima versioniran evidence resolver i jasno razlikuje open/applied/unknown.
4. Captcha i druge security stavke nestaju samo uz kompletan efektivni dokaz.
5. GET ima bounded query/p95 budžet, ciljanu invalidaciju i partial failure semantiku.
6. Dismiss je idempotentan/CAS, auditira stvarni item snapshot i može se resetovati.
7. Response izlaže freshness/version bez secret/PII podataka.
8. Oba suitea i prošireni E2E/fault/concurrency testovi prolaze.

Modul je kvalitetno izolovan i siguran u osnovnom pristupu, ali trenutni globalni trajni dismissal i marker-based evidence mogu sakriti nove sigurnosne i setup obaveze. Iskren baseline je **6,08/10**.
