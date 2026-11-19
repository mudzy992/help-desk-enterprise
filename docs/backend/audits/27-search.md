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
| BA-search-01 | P1       | Bilo koji scoped ADMIN može globalno pretraživati ID/ime/e-mail svih aktivnih korisnika | zatvoreno |
| BA-search-02 | P2       | MinLength se provjerava prije trimovanja pa whitespace bypassa minimalni effective query | zatvoreno |
| BA-search-03 | P2       | KB global top-75 kandidati prije scope filtera mogu sakriti postojeće vidljive rezultate | zatvoreno |
| BA-search-04 | P2       | KB query učitava cijeli red i hidden body prije visibility odluke                       | zatvoreno |
| BA-search-05 | P2       | Endpoint nema server-side rate limit ni anti-enumeration zaštitu                        | zatvoreno |
| BA-search-06 | P2       | Modul nasljeđuje KB owner/reviewer scope bypass iz audita 25                            | otvoreno |
| BA-search-07 | P2       | Nema query-plan/perf dokaza za contains nad user email/name i KB title                  | otvoreno |
| BA-search-08 | P2       | Jedan dependency kvar ruši sve grupe bez definisanog partial/fail-closed ugovora        | otvoreno |
| BA-search-09 | P3       | User ordering nema ID tie-breaker pa capped rezultat nije stabilan                      | otvoreno |
| BA-search-10 | P3       | `types` nema ArrayUnique i ugovor prihvata duplikate                                    | otvoreno |
| BA-search-11 | P3       | Nema privacy-safe search telemetry, per-group latency/SLO ni incomplete indikator       | otvoreno |
| BA-search-12 | P3       | Confidential/archive/revoke semantika nema direktan search test                         | otvoreno |
| BA-search-13 | P3       | Glavni service suite je compile-blocked i nema direktnog `/search` E2E                  | otvoreno |

## 11. Ključne korekcije

- **01:** riješeno u W7.55 (`user.directory.read` + OU subtree + e-mail samo za globalni doseg); detalji u §15.
- **02:** riješeno u W7.56 (normalizacija prije validacije, brojanje karaktera, granik poslije NFKC); `10` ostaje otvoren.
- **03–04:** riješeno u W7.57 (bounded keyset scan + batch vidljivost + `articlesIncomplete`) i W7.58
  (minimalna projekcija: `body` se ne čita prije autorizacijske odluke); SQL scope pushdown odbijen jer bi
  bio druga kopija autorizacije.
- **05:** riješeno u W7.59 (dva distribuirana fiksna prozora — actor i adresa — sa Redis Lua INCR+EXPIRE,
  per-instance degradacijom i fail-closed `503` kad verdikta nema); `07` (EXPLAIN/index dokaz) ostaje otvoren.
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

## 15. Implementacijski closeout — W7.55 (`BA-search-01`)

**Status nalaza:** `BA-search-01` (P1) **zatvoren**; paket W7.55, kod `091505c`, **bez migracije**.
Detalji: [276](../implementation/276-w755-search-01-directory-scope.md).

**Šta je bilo:** `search-users.ts` je propuštao grupu svakom actoru sa `ADMIN` roleKey-om i radio globalni
`user.findMany` bez predikata nad jedinicom; response je nosio `id`, `displayName` i `email` svih aktivnih
korisnika. Scoped administrator je mogao enumerisati cijeli imenik.

**Šta je sada:** politika živi u novom `search-directory-scope.ts`, u dva čista koraka — grant
(`resolveDirectorySearchGrant`) i razrješenje u ID-jeve podstabla (`resolveDirectorySearchScope`, preko postojeće
`selectOrganizationalUnitIdsInScope`). Grant je **permisija** `user.directory.read` (katalog + bs/en naslov +
default dodjela roli `ADMIN`), uz dokumentovanu legacy ekvivalenciju za `ADMIN` roleKey koja **nikad** ne daje
globalni doseg ni e-mail. Globalni doseg ima `SUPER_ADMIN` i izričito unscoped dodjela permisije; servisno
ograničena dodjela nije globalna. Scoped čitanje ima `organizationalUnitId: { in: [...] }` i `select` bez
e-maila (PII se ne čita), globalni doseg vraća e-mail (`UserSearchMatch.email: string | null`), a paleta red bez
e-maila prikazuje samo ime. Svaki nerazrješiv slučaj (nema grante, putanja bez jedinice, blank putanja,
nepoznata jedinica) je prazna grupa — ticket i article grupe ostaju netaknute.

**Acceptance:** §6 i §14.1 su ispunjeni (podstablo, eksplicitna permisija, globalno samo za SUPER_ADMIN odnosno
izričitu unscoped dodjelu, minimalan response, fail-closed). Referentni dokaz:
`search-directory-scope.spec.ts` (11 testova) i `search.service.spec.ts` (cross-unit scenario provjerava da
`where` nosi `organizationalUnitId.in` i da `select` nema e-mail).

**Šta ostaje u ovom modulu:** P1 nema. P2: `BA-search-02` (normalizacija prije validacije), `03`/`04` (KB
kandidati i minimalna projekcija), `05` (rate limit/anti-enumeration), `06` (KB owner/reviewer scope), `07`
(query plan), `08` (partial/fail-closed ugovor). P3: `09` (stable order — tie-breaker nije dio W7.55), `10`,
`11`, `12`, `13` (suite se izvršava, E2E za `/search` i dalje nema).

**Preostali rizik:** postojeće ADMIN role nemaju `user.directory.read` red (nema migracije), pa legacy grana
ostaje dok se ne izvede kontrolisani backfill; unscoped `ADMIN` bez permisije i dalje čita cijeli imenik, ali bez
e-maila. Vodič `uloge-i-dozvole` navodi 63 permisije (stvarni katalog 69) — drift stariji od ovog paketa.

## 16. Implementacijski closeout — W7.56 (`BA-search-02`)

**Status nalaza:** `BA-search-02` (P2) **zatvoren**; paket W7.56, kod `989ad15`, **bez migracije**.
Detalji: [277](../implementation/277-w756-search-02-query-normalization.md).

**Šta je bilo:** `@MinLength(2)`/`@MaxLength(200)` su se provjeravali na sirovom stringu, a `toSearchQuery` je
trimovao poslije. `?q=%20%20` je tako postao prazan needle (`contains ''` → najnoviji vidljivi redovi svake
grupe), `?q=%20a` jednoslovni, a dva zero-width karaktera ili jedan emoji prolazili su kao „dva znaka”.

**Šta je sada:** jedno pravilo u `normalize-search-query.ts` (NFKC → uklanjanje format/zero-width karaktera →
kontrolni u razmak → kolaps whitespacea → trim, idempotentno) izvršava se **prije validacije** (`@Transform`), a
`SearchQueryLengthConstraint` broji karaktere normalizovane vrijednosti. `toSearchQuery` normalizuje i ručno
konstruisan DTO, a `SearchService.search` normalizuje i odbija neupotrebljiv upit sa `400` prije nego pokrene
ijednu grupu. Gornji granik od 200 karaktera važi poslije NFKC preslikavanja (koje može proširiti unos).
Paleta primjenjuje isto pravilo lokalno i šalje normalizovan needle.

**Acceptance:** §14.2 je ispunjen (effective normalizovan upit kraći od dva znaka uvijek se odbija, i na DTO i
na servisnom putu). Dokaz: `normalize-search-query.spec.ts` (9), `search-query.dto.spec.ts` (+5),
`search.service.spec.ts` (+2), `use-command-palette-search.spec.tsx` (+2).

**Šta ostaje u ovom modulu:** P1 nema. P2: `BA-search-03`/`04` (KB kandidati i minimalna projekcija), `05`
(rate limit/anti-enumeration), `06` (KB owner/reviewer scope), `07` (query plan), `08` (partial/fail-closed
ugovor). P3: `09` (stable order), `10` (`ArrayUnique`), `11` (telemetrija), `12` (confidential/arhiva), `13`
(E2E za `/search`).

**Preostali rizik:** upit bez dva znaka sadržaja sada vraća `400` (stariji klijenti sa jednoslovnim upitom
dobijaju grešku umjesto širokog rezultata); klijentsko i serversko pravilo su dvije implementacije iste norme.

## 17. Implementacijski closeout — W7.57 (`BA-search-03`)

**Status nalaza:** `BA-search-03` (P2) **zatvoren**; paket W7.57, kod `6d46e07`, **bez migracije**.
Detalji: [278](../implementation/278-w757-search-03-bounded-kb-candidates.md).

**Šta je bilo:** article grana je čitala najviše `limit × 3` naslova sortiranih globalno po `updatedAt desc` i
tek onda filtrirala vidljivost, red po red (`isKnowledgeArticleVisibleTo` = tri upita). Ako je taj prozor
pripadao drugim OU/servisima ili klasifikaciji iznad dosega, actor je dobijao praznu ili kratku grupu iako su
stariji vidljivi pogoci postojali; a odsječen odgovor nije nosio nikakav signal da je odsječen.

**Šta je sada:** `searchKnowledgeArticleTitles` je **bounded keyset šetnja** — `listScanBatchSize` (50) redova
po batchu sa `take: 51`, najviše `maximumListScanBatches` (4) batcha (≤ 200 kandidata), redoslijed
`(updatedAt desc, id asc)`, nastavak preko `OR: [{ updatedAt: { lt } }, { updatedAt: jednako, id: { gt } }]`.
Vidljivost se rješava **po batchu** postojećom `loadKnowledgeArticleVisibilities` (bez N+1), a petlja nastavlja
i poslije nevidljivih redova dok ne napuni `limit` ili ne potroši budget. Rezultat je `{ items, incomplete }`;
`incomplete: true` znači „skeniranje je stalo, ima još pogodaka”, `false` znači iscrpnu grupu. `/search` ga
izlaže kao `articlesIncomplete`, a komandna paleta prikazuje napomenu ispod grupe članaka. `candidateMultiplier`
je uklonjen. SQL scope pushdown je odbijen svjesno (vidljivost zavisi od klasifikacije, statusa, OU putanje,
servisnog dosega, tri permission ključa, identiteta i članstva u grupi — SQL ogledalo bi bilo druga kopija
autorizacije); pushdown koji je ekvivalentan JS provjeri (`status != ARCHIVED`, `title contains`) ostaje u upitu.

**Acceptance:** §14.3 (vidljivi pogodak ne nestaje zbog novijih hidden kandidata) i §14.7 (stabilan redoslijed
i eksplicitna incomplete semantika za article grupu) su ispunjeni; §14.1, §14.2 iz ranijih paketa ostaju
netaknuti. Dokaz: `search-knowledge-article-titles.spec.ts` (10 testova), `search.service.spec.ts` (+1 i
ažuriran stub), `header-search-match.spec.ts` (+1), `use-command-palette-search.spec.tsx` (+1),
`command-palette.spec.tsx` (+1).

**Šta ostaje u ovom modulu:** P1 nema. P2: `BA-search-04` (minimalna projekcija reda), `05` (rate
limit/anti-enumeration), `06` (KB owner/reviewer scope), `07` (query plan), `08` (partial/fail-closed ugovor).
P3: `09` (stable order), `10` (`ArrayUnique`), `11` (telemetrija), `12` (confidential/arhiva), `13` (E2E za
`/search`).

**Preostali rizik:** novi flag je aditivan ali ga svaki potrošač mora poznavati (odsustvo = `false` je
tolerantno ponašanje, ne ugovor); `incomplete` ne govori *koliko* je propušteno; 200-redni scan po zahtjevu bez
rate limita ostaje ponovljiv teret (`05`); `contains` nad naslovom još nema index (`07`), a red se i dalje čita
cijel, uključujući `body` (`04`).

## 18. Implementacijski closeout — W7.58 (`BA-search-04`)

**Status nalaza:** `BA-search-04` (P2) **zatvoren**; paket W7.58, kod `156bb1b`, **bez migracije**.
Detalji: [279](../implementation/279-w758-search-04-minimal-kb-projection.md).

**Šta je bilo:** title upit nije imao `select`, pa je svaki kandidat stizao kao cijeli red — `body` (do 20.000
znakova), kategorija, FAQ i counteri — a vidljivost se odlučivala tek poslije. Tekst članka koji actor ne smije
vidjeti bio je materijalizovan u procesu i u svakom debug/log dumpu, iako nikad nije otišao u odgovor.

**Šta je sada:** novo `search-knowledge-article-projection.ts` definiše `knowledgeArticleTitleSearchSelect` —
tačno izlazne kolone (`id`, `slug`, `title`), kolone predikata (`status`, `classification`,
`organizationalUnitId`, `serviceId`, `ownerUserId`, `ownerGroupId`, `reviewerUserId`) i keyset poziciju
(`updatedAt`) — i tip reda koji upit vraća. Upit nosi `select`, pa `body` nikad ne ulazi u čitanje. Novi
`KnowledgeArticleVisibilityRecord` (`Pick` tih kolona) je ulaz `canReadKnowledgeArticle`,
`isKnowledgeArticleOwner/Reviewer` i `loadKnowledgeArticleVisibilities`: pun `KnowledgeArticleRecord` ostaje
kompatibilan, pa lista/intercept/mutacije rade nepromijenjeno, a funkcija koja bi tražila tekst ne bi se
kompajlirala. Testni double poštuje `select` kao Prisma.

**Acceptance:** §14.4 je ispunjen (hidden `body` se ne učitava prije autorizacijske odluke), a §14.3 i §14.7 iz
W7.57 ostaju netaknuti (isti keyset, isti `incomplete`, ista vidljivost — dokazano paritetom odluka).
Dokaz: `search-knowledge-article-projection.spec.ts` (4 testa: minimalan `select`, paritet odluka 7 aktera × 7
članaka, paritet batch vidljivosti, canary `body` van projekcije) i `search-knowledge-article-titles.spec.ts`
(11 testova, +1 canary test; batching test provjerava `select`).

**Šta ostaje u ovom modulu:** P1 nema. P2: `BA-search-05` (rate limit/anti-enumeration), `06` (KB
owner/reviewer scope), `07` (query plan), `08` (partial/fail-closed ugovor). P3: `09` (stable order), `10`
(`ArrayUnique`), `11` (telemetrija), `12` (confidential/arhiva), `13` (E2E za `/search`).

**Preostali rizik:** lista i intercept i dalje čitaju `body` prije odluke jer ga vraćaju za vidljive redove —
dvofazni read (vidljivost → tijela dozvoljenih ID-eva) je zaseban KB paket; projekcija ne mijenja query plan
(`07`), ne uvodi rate limit (`05`) i ne dira delegaciju iz audita 25 (`06`).

## 19. Implementacijski closeout — W7.59 (`BA-search-05`)

**Status nalaza:** `BA-search-05` (P2) **zatvoren**; paket W7.59, kod `4b15dfa`, **bez migracije**.
Detalji: [280](../implementation/280-w759-search-05-rate-limit.md).

**Šta je bilo:** endpoint nije imao server-side budžet. Debounce u browseru nije kontrola; direktni klijent je
mogao slati neograničen broj zahtjeva, a svaki pokreće tri grupe (auth/authorization, do 200 KB kandidata,
ticket/directory upiti). `contains` nad imenom/e-mailom i naslovom bez limita daje brzu enumeraciju.

**Šta je sada:** dva **distribuirana fiksna prozora** po zahtjevu — `actor` (subject sesije) i `adresa`
(`request.ip`, pseudonimni SHA-256 ključevi) — provjerena u `SearchRateLimitGuard`-u **prije** DTO validacije i
prije ijedne grupne pretrage. Redis drži brojače atomično (Lua `INCR` + `EXPIRE`), pa su zajednički svim
replikama; bez Redisa isti brojevi važe **per instanca** (bounded degradacija, nikad fail-open), a ako se budžet
ne može izračunati uopšte, endpoint vraća `503 SEARCH_RATE_LIMIT_UNAVAILABLE` (fail-closed). Prekoračenje je
`429 TOO_MANY_SEARCH_REQUESTS` + `Retry-After`. Default 30/min po actoru i 60/min po adresi, konfigurabilno kroz
`SEARCH_RATE_LIMIT_*` (neispravna vrijednost pada na default, nikad na slabiji limit; `false` je break-glass).
Paleta prikazuje `palette.rateLimited` umjesto „nema rezultata”.

**Acceptance:** §14.5 (distribuiran bounded budget) je ispunjen za `search` modul; §14.6 (security greška nikad
nije partial success) ostaje predmet `BA-search-08` za greške grupa, ali budžet više ne može tiho oslabiti.
Dokaz: `search-rate-limit.configuration.spec.ts` (4), `search-rate-limit.spec.ts` (9), `search-rate-limit.guard.spec.ts`
(3), hook (+2) i paleta (+1) test.

**Šta ostaje u ovom modulu:** P1 nema. P2: `BA-search-06` (KB owner/reviewer scope), `07` (query plan), `08`
(partial/fail-closed ugovor). P3: `09` (stable order), `10` (`ArrayUnique`), `11` (telemetrija), `12`
(confidential/arhiva), `13` (E2E za `/search`).

**Preostali rizik:** legitimna automatizacija iznad 30 pretraga u minuti dobija `429` (limit je zato po
deploymentu); bez Redisa budžet je `replike × limit`; fiksni prozor dopušta do 2× na granici; `contains` bez
indeksa (`07`) i telemetrija (`11`) nisu dio paketa; klijent nema automatski backoff na `429`.
