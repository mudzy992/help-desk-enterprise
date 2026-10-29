# Backend audit 27 — `search`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** srednji  
**Baseline ocjena:** **5,62/10**  
**Nalazi:** 1 P1, 7 P2, 5 P3

## 1. Executive summary

`search` je mali orkestracijski modul za globalnu header/command-palette pretragu tiketa, knowledge članaka i korisnika. Pozitivna osnova je dobra: endpoint je session/role guarded, tipovi i limit su allowlisted, maksimalno 25 rezultata po grupi, ticket put ponovo koristi centralni ticket gate/list visibility i usku projekciju, article put je bounded i svaku kandidaturu provjerava centralnom KB visibility funkcijom, a grupe se preskaču ako nisu tražene.

Baseline je **5,62/10**. Jedan P1 nalaz je cross-scope directory disclosure: bilo koji actor sa `ADMIN` assignmentom, bez obzira na OU/service scope i bez posebnog user-read permissiona, može globalno pretraživati sve aktivne korisnike po imenu/e-mailu i dobiti njihov ID, puno ime i adresu. Komentar opravdava ponašanje paritetom sa postojećim OU user endpointom, ali naslijeđena široka površina nije sigurnosna granica.

Dodatni rizici su whitespace bypass minimalne dužine, KB candidate starvation, učitavanje cijelog KB reda prije visibility odluke, bez rate limita/anti-enumeration zaštite, nedeterminističan user order pri istom imenu, bez telemetry/SLO dokaza i compile-blokiran glavni service suite. Nema P0. Popravke nisu implementirane.

## 2. Scope i inventar

- 7 produkcijskih TypeScript fajlova;
- 2 direktna speca;
- 311 aktuelnih produkcijskih LOC;
- 1 controller i 1 injectable servis;
- nema vlastitih Prisma modela;
- integracije: authentication/authorization context, tickets, knowledge-base i users;
- direktni E2E za `/search` nije pronađen; frontend command-palette ponašanje djelimično pokrivaju E2E 22, 54 i 56.

Registarskih 318 LOC korigovano je na 311.

## 3. API ugovor i validacija

`GET /search` traži prijavljenu sesiju i jednu od USER/AGENT/ADMIN/SUPER_ADMIN uloga. Query DTO allowlista `ticket|article|user`, odbija nepoznate parametre, ograničava upit na 2–200 znakova i limit na 1–25. Default je 15 rezultata po grupi. Nezatražena grupa ne izvršava query.

Validacija dužine se ipak izvršava prije `trim()`. Vrijednosti poput dvije praznine ili whitespace + jedan znak prolaze `MinLength(2)`, a `toSearchQuery` ih pretvara u prazan/jednoznakovni effective query. Prazan `contains` može vratiti najnovije vidljive tikete/članke i širok user set, protivno ugovoru i zaštiti od skupih upita. Normalizacija mora prethoditi validaciji; nakon Unicode trim/NFKC effective query mora i dalje imati najmanje dva grapheme/code-point znaka.

`types` dopušta duplikate jer nema `ArrayUnique`; `Set` ih funkcionalno uklanja, pa je ovo samo ugovorna nedosljednost. Maksimalan response je 75 hitova, ali nema ukupnog budgeta ako se kasnije dodaju tipovi.

## 4. Ticket pretraga

Ticket grana poziva `TicketsService.searchTickets`, koji prolazi puni ticket gate, aktuelnu archive konfiguraciju i centralni list where builder. Čita samo `id`, `ticketNumber` i `title`, bez description/formData. Limit se spušta u DB query. Ovo je snažan security-by-reuse obrazac.

Naslijeđena semantika ipak vraća naslov confidential tiketa svakome kome centralni ticket list daje pristup. To je ispravno samo ako command palette ima identičnu shoulder-surfing/UI politiku kao ticket lista. Nema zasebnog testa za scope revoke između sessiona i searcha, confidential title, archive switch ni merged/removed ticket.

## 5. Knowledge article pretraga

Article grana uzima najviše `limit × 3` ne-arhiviranih title match kandidata, pa za svakog poziva `isKnowledgeArticleVisibleTo`. Ne vraća hidden article i koristi centralnu classification/owner/reviewer logiku.

Međutim kandidati se sortiraju globalno po `updatedAt` prije scope filtera. Ako prvih 75 pripada drugim OU/service scopeovima, actor dobija prazan ili nepotpun rezultat iako postoje stariji vidljivi match-evi. Fiksni multiplier nije pagination niti dokaz completenessa. Scope treba pushati u DB koliko je moguće ili iterirati bounded cursor stranice do `limit`/scan-budgeta uz `hasMore/incomplete` ugovor.

`findMany` nema `select`, pa u proces učitava body i sve ostale article kolone, uključujući sadržaj članka koji će visibility filter kasnije odbiti. Iako se ne serializuje, to širi privacy blast radius i rizik log/debug dumpa. Potrebna je minimalna visibility projekcija ili DB-side authorized view. Modul također nasljeđuje owner/reviewer authorization nalaze audita 25.

## 6. User/directory pretraga

User grana je dostupna kada authorization context ima bilo koji `ADMIN` roleKey ili je actor SUPER_ADMIN. Ne provjerava permission key, assignment OU, service scope niti odnos prema rezultatu. Query zatim globalno pretražuje sve aktivne korisnike i vraća `id`, `displayName` i `email`.

Scoped administrator jedne jedinice zato može enumerisati identitete i e-mail adrese korisnika iz svih drugih jedinica. Postojeći `GET /organizational-units/:id/users` također ima širok ADMIN guard, ali to samo potvrđuje naslijeđeni cross-cutting problem; globalni typeahead ga čini lakše pretraživim. Potrebna je eksplicitna `users.read`/directory-search permission politika, OU subtree predicate, SUPER_ADMIN-only global mode i privacy-minimal response (npr. email samo kada je potreban).

Order je samo `displayName asc`; isti display name nema stabilan `id` tie-breaker, pa capped rezultati mogu varirati. `contains` nad imenom/e-mailom bez rate limita omogućava brzu prefix/substring enumeraciju. Aktivnost se filtrira, što je pozitivno.

## 7. Resource safety i operativnost

Svaka pojedinačna grana je bounded, a tri grane rade paralelno. Međutim endpoint nema actor/IP rate limit, cache, request coalescing, timeout/budget ni circuit breaker. Debounce u browseru nije server-side kontrola; direktni klijent može generisati tri DB/auth workload-a po zahtjevu. Posebno su skupi wildcard-style `contains` upiti bez dokazanog trigram/index plana za user i KB title.

Nema search telemetry za latency po grupi, candidate-to-visible ratio, denied/incomplete rezultat, timeout ni DB row scan. Nema audit potrebe za običan query string jer može sadržati PII; ako se uvede telemetry, termin se ne smije logovati sirov. Potrebni su hashed/length-only metrički atributi i per-group SLO.

`Promise.all` znači da kvar jedne tražene grupe ruši cijeli odgovor. Za command palette može biti poželjan typed partial response, ali odluka mora biti eksplicitna: fail-closed za authorization grešku, kontrolisani partial za availability kvar bez prikrivanja security failurea.

## 8. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  src/modules/search/search-query.dto.spec.ts \
  src/modules/search/search.service.spec.ts
```

Rezultat: **1/2 suitea prošao, 1/2 compile-blocked; 5/5 izvršenih testova prošlo**. DTO suite je zelen. Service suite se nije izvršio zbog nepotpunog generated Prisma/`PrismaService` contracta u transitivnom routing kodu (`group` i `service` delegati nedostaju). Nije zabilježen assertion failure.

Service spec izvorno pokriva ticket scope/list parity, requester, limit/type skip, admin-only user grupu i unknown actor fail-closed, ali taj dokaz u aktuelnom checkoutu nije izvršiv. Nema testa za scoped ADMIN cross-OU directory, whitespace-only query, KB candidate starvation, minimal article projection, stable user order, rate limit, partial dependency failure ni real DB query plan. Nema direktnog backend E2E za `/search` i klik rezultata.

## 9. Pozitivni nalazi

1. Session i role guard na endpointu.
2. Strict whitelist query validacija.
3. Allowlisted tipovi i hard per-group limit.
4. Nezatražene grupe ne izvršavaju query.
5. Ticket put ponovo koristi centralni gate/list visibility.
6. Ticket DB projection sadrži samo tri potrebne kolone.
7. Article candidates su bounded i pojedinačno visibility-filterovani.
8. Archived članci se ne kandiduju.
9. Neaktivni korisnici se ne vraćaju.
10. Paralelno izvršenje smanjuje zbirnu latenciju.
11. Svih 5 izvršenih testova je zeleno.

## 10. Registar nalaza

| ID           | Severity | Nalaz                                                                                   | Status   |
| ------------ | -------- | --------------------------------------------------------------------------------------- | -------- |
| BA-search-01 | P1       | Bilo koji scoped ADMIN može globalno pretraživati ID/ime/e-mail svih aktivnih korisnika | otvoreno |
| BA-search-02 | P2       | MinLength se provjerava prije trimovanja pa whitespace bypassa minimalni effective query | otvoreno |
| BA-search-03 | P2       | KB global top-75 kandidati prije scope filtera mogu sakriti postojeće vidljive rezultate | otvoreno |
| BA-search-04 | P2       | KB query učitava cijeli red i hidden body prije visibility odluke                       | otvoreno |
| BA-search-05 | P2       | Endpoint nema server-side rate limit ni anti-enumeration zaštitu                        | otvoreno |
| BA-search-06 | P2       | Modul nasljeđuje KB owner/reviewer scope bypass iz audita 25                            | otvoreno |
| BA-search-07 | P2       | Nema query-plan/perf dokaza za contains nad user email/name i KB title                  | otvoreno |
| BA-search-08 | P2       | Jedan dependency kvar ruši sve grupe bez definisanog partial/fail-closed ugovora        | otvoreno |
| BA-search-09 | P3       | User ordering nema ID tie-breaker pa capped rezultat nije stabilan                      | otvoreno |
| BA-search-10 | P3       | `types` nema ArrayUnique i ugovor prihvata duplikate                                    | otvoreno |
| BA-search-11 | P3       | Nema privacy-safe search telemetry, per-group latency/SLO ni incomplete indikator       | otvoreno |
| BA-search-12 | P3       | Confidential/archive/revoke semantika nema direktan search test                         | otvoreno |
| BA-search-13 | P3       | Glavni service suite je compile-blocked i nema direktnog `/search` E2E                  | otvoreno |

## 11. Ključne korekcije

- **01:** permission + OU subtree directory policy; globalni directory samo eksplicitno ovlaštenim actorima; minimizirati email.
- **02,10:** normalize-before-validate, Unicode/grapheme pravilo i unique types.
- **03–04:** DB scope pushdown ili bounded cursor scan, incomplete contract i minimalna article projekcija.
- **05,07:** Redis actor/IP token bucket, timeout/query budget i EXPLAIN/index dokaz.
- **06:** primijeniti korekcije delegacije iz audita 25 prije oslanjanja na centralni KB predicate.
- **08:** typed group outcome; auth greške fail-closed, odobreni availability kvar može biti partial.
- **09,11:** stabilan order i privacy-safe metrički sloj bez raw queryja.
- **12–13:** regenerisan Prisma client, unit/integration/E2E matrica i scope-revoke/perf dokaz.

## 12. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   7,00 |
| B. API i ugovori             |    12% |   6,40 |
| C. Auth/authz/scope          |    15% |   4,50 |
| D. Poslovna pravila/stanje   |    13% |   6,00 |
| E. Podaci/Prisma/transakcije |    13% |   6,00 |
| F. Sigurnost/privatnost      |    12% |   4,80 |
| G. Async/integracije         |     8% |   7,00 |
| H. Testovi/dokazivost        |    10% |   4,20 |
| I. Operativnost/perf.        |     7% |   5,20 |
| **Ukupno**                   | **100%** | **5,62/10** |

Ponderisani zbir je 5,623, zaokružen na **5,62/10**. Otvoreni P1 nalaz ograničava maksimum na 7,49.

## 13. Fazni plan

### Faza 0 — safety net

Scoped ADMIN cross-OU directory; whitespace/NFKC; 100 hidden pa visible KB match; concurrent query burst; dependency timeout; scope revoke; duplicate names.

### Faza 1 — authorization i privacy

Directory permission/scope policy, minimalni response i KB delegation korekcije.

### Faza 2 — query correctness

Normalize-before-validate, stable ordering, scope-pushed/cursor KB search i incomplete contract.

### Faza 3 — abuse i resilience

Distributed rate limit, timeout/budget, privacy-safe telemetry i typed partial/fail-closed behavior.

### Faza 4 — finalni gate

Regenerisan Prisma client; oba suitea; Postgres index/EXPLAIN sa realnim volumenom; `/search` E2E za USER/AGENT/scoped ADMIN/SUPER_ADMIN i finalni command-palette test.

## 14. Acceptance i konačna presuda

1. Scoped administrator ne može otkriti korisnika izvan odobrenog OU podstabla.
2. Effective normalized query kraći od dva znaka uvijek se odbija.
3. Postojeći vidljivi KB rezultat ne nestaje samo zbog novijih hidden kandidata.
4. Hidden article body se ne učitava prije authorization odluke.
5. Endpoint ima distribuiran bounded rate/query budget i dokaziv index plan.
6. Security failure jedne grupe nikad se ne pretvara u partial success.
7. Rezultati imaju stabilan redoslijed i eksplicitnu incomplete semantiku.
8. Search telemetry ne pohranjuje raw PII termine.
9. Oba direktna suitea i realni scope/revoke/perf E2E prolaze.

Modul je arhitektonski uredan i dobro ponovo koristi ticket/KB granice, ali globalna directory pretraga za bilo koji ADMIN assignment, validation bypass i nepotpuna KB candidate semantika sprečavaju enterprise ocjenu. Iskren ponderisani baseline je **5,62/10**.
