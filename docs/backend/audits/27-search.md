# Backend audit 27 — `search`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** srednji  
**Baseline ocjena:** **5,62/10**  
**Nalazi:** 1 P1, 7 P2, 5 P3<br>
**Implementacija:** **13/13 zatvoreno — modul zatvoren** — W7.55–W7.63 (`BA-search-01`–`08`, uključujući
migraciju trigram indeksa), W7.110 (`BA-search-09`, stabilan poredak imenika sa `id` tie-breakerom), W7.111
(`BA-search-10`, `types` je set), W7.112 (`BA-search-11`, privacy-safe telemetrija sa per-group SLO), W7.113
(`BA-search-12`, direktni testovi confidential/arhiva/merge/revoke semantike) i W7.114 (`BA-search-13`, direktni
`/search` E2E sa klikom rezultata + dokaz da je „compile-blocked” tvrdnja iz §8 zastarjela). P1 nema, P2 nema.
Ova statusna dopuna ne mijenja nalaze ni ocjenu.

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

**Status poslije W7.111 (§25):** `types` nosi `@ArrayUnique()`, pa ponovljena grupa (`types=ticket,ticket`, isti
parametar dva puta ili niz sa duplikatom) završava kao `400` na polju `types`; `toSearchQuery` dodatno deduplicira
uz redoslijed prvog pojavljivanja, a `Set` u servisu ostaje najniži sloj. `ArrayMaxSize` se više ne može „potrošiti”
duplikatima. Ukupan response budget ostaje tema `BA-search-11`. Detalji:
[333](../implementation/333-w7111-search-10-types-unique.md).

## 4. Ticket pretraga

Ticket grana poziva `TicketsService.searchTickets`, koji prolazi puni ticket gate, aktuelnu archive konfiguraciju i centralni list where builder. Čita samo `id`, `ticketNumber` i `title`, bez description/formData. Limit se spušta u DB query. Ovo je snažan security-by-reuse obrazac.

Naslijeđena semantika ipak vraća naslov confidential tiketa svakome kome centralni ticket list daje pristup. To je ispravno samo ako command palette ima identičnu shoulder-surfing/UI politiku kao ticket lista. Nema zasebnog testa za scope revoke između sessiona i searcha, confidential title, archive switch ni merged/removed ticket.

**Status poslije W7.113 (§27):** semantika je sada **dokazana direktno kroz `/search`**, u paru sa `GET /tickets` za
istog aktera: confidential naslov se ne vraća bez granta (requester i assignee ga vide, projekcija ostaje
`{id, ticketNumber, title}`); paleta **nikad** ne vraća arhivirani tiket (ni SUPER_ADMIN-u) i ne zavisi od archive
switcha, dok lista kroz `status=ARCHIVED` jeste pod switchom; spojeni child ostaje pronađiv, isto kao lista bez
opcionog `hideMerged` filtera; suženje ili ukidanje konteksta između sesije i pretrage mijenja odgovor odmah (403 za
ukinut kontekst, nikad prazan „nema pogodaka”). Detalji:
[335](../implementation/335-w7113-search-12-ticket-semantics.md).

## 5. Knowledge article pretraga

Article grana uzima najviše `limit × 3` ne-arhiviranih title match kandidata, pa za svakog poziva `isKnowledgeArticleVisibleTo`. Ne vraća hidden article i koristi centralnu classification/owner/reviewer logiku.

Međutim kandidati se sortiraju globalno po `updatedAt` prije scope filtera. Ako prvih 75 pripada drugim OU/service scopeovima, actor dobija prazan ili nepotpun rezultat iako postoje stariji vidljivi match-evi. Fiksni multiplier nije pagination niti dokaz completenessa. Scope treba pushati u DB koliko je moguće ili iterirati bounded cursor stranice do `limit`/scan-budgeta uz `hasMore/incomplete` ugovor.

`findMany` nema `select`, pa u proces učitava body i sve ostale article kolone, uključujući sadržaj članka koji će visibility filter kasnije odbiti. Iako se ne serializuje, to širi privacy blast radius i rizik log/debug dumpa. Potrebna je minimalna visibility projekcija ili DB-side authorized view. Modul također nasljeđuje owner/reviewer authorization nalaze audita 25.

## 6. User/directory pretraga

User grana je dostupna kada authorization context ima bilo koji `ADMIN` roleKey ili je actor SUPER_ADMIN. Ne provjerava permission key, assignment OU, service scope niti odnos prema rezultatu. Query zatim globalno pretražuje sve aktivne korisnike i vraća `id`, `displayName` i `email`.

Scoped administrator jedne jedinice zato može enumerisati identitete i e-mail adrese korisnika iz svih drugih jedinica. Postojeći `GET /organizational-units/:id/users` također ima širok ADMIN guard, ali to samo potvrđuje naslijeđeni cross-cutting problem; globalni typeahead ga čini lakše pretraživim. Potrebna je eksplicitna `users.read`/directory-search permission politika, OU subtree predicate, SUPER_ADMIN-only global mode i privacy-minimal response (npr. email samo kada je potreban).

Order je samo `displayName asc`; isti display name nema stabilan `id` tie-breaker, pa capped rezultati mogu varirati.

**Status poslije W7.110 (§24):** sve tri grane imenika sortiraju po `displayName`, pa **`id`** (`directoryUserOrder`
u `search-users.ts`). Poredak je totalan, pa je sastav ograničene stranice reproducibilan; PostgreSQL test pravi
četiri imenjaka i dokazuje identične, rastuće ID-eve kroz dvije identične pretrage, a plan-suite objašnjava isti SQL i
traži oba ključa u `Sort Key`. Detalji:
[332](../implementation/332-w7110-search-09-directory-order-tiebreaker.md). `contains` nad imenom/e-mailom bez rate limita omogućava brzu prefix/substring enumeraciju. Aktivnost se filtrira, što je pozitivno.

## 7. Resource safety i operativnost

Svaka pojedinačna grana je bounded, a tri grane rade paralelno. Međutim endpoint nema actor/IP rate limit, cache, request coalescing, timeout/budget ni circuit breaker. Debounce u browseru nije server-side kontrola; direktni klijent može generisati tri DB/auth workload-a po zahtjevu. Posebno su skupi wildcard-style `contains` upiti bez dokazanog trigram/index plana za user i KB title.

Nema search telemetry za latency po grupi, candidate-to-visible ratio, denied/incomplete rezultat, timeout ni DB row scan. Nema audit potrebe za običan query string jer može sadržati PII; ako se uvede telemetry, termin se ne smije logovati sirov. Potrebni su hashed/length-only metrički atributi i per-group SLO.

**Status poslije W7.112 (§26):** svaki odgovoren zahtjev ostavlja jednu `search_telemetry=1` liniju sa trajanjem
cijelog zahtjeva i svake grupe, brojem hitova, stanjem grupe (`ok`/`failed`/`skipped`), SLO prekršajima i
`incomplete` listom. Termin nikad nije u liniji: nosi se samo `query_len` i 16-hex HMAC-SHA256 (`query_hash`) uz
`SEARCH_TELEMETRY_SALT`. Prekršaj per-group (250/500/250 ms) ili ukupnog budžeta (900 ms) piše se kao `warn`. Nema
novog endpointa ni Redis brojača; timeout i „candidate-to-visible ratio” ostaju otvorene teme. Detalji:
[334](../implementation/334-w7112-search-11-telemetry.md).

`Promise.all` znači da kvar jedne tražene grupe ruši cijeli odgovor. Za command palette može biti poželjan typed partial response, ali odluka mora biti eksplicitna: fail-closed za authorization grešku, kontrolisani partial za availability kvar bez prikrivanja security failurea.

## 8. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  src/modules/search/search-query.dto.spec.ts \
  src/modules/search/search.service.spec.ts
```

Rezultat (mjereno 2026-10-23): **1/2 suitea prošao, 1/2 compile-blocked; 5/5 izvršenih testova prošlo**. DTO suite je zelen. Service suite se nije izvršio zbog nepotpunog generated Prisma/`PrismaService` contracta u transitivnom routing kodu (`group` i `service` delegati nedostaju). Nije zabilježen assertion failure.

Service spec izvorno pokriva ticket scope/list parity, requester, limit/type skip, admin-only user grupu i unknown actor fail-closed, ali taj dokaz u aktuelnom checkoutu nije izvršiv. Nema testa za scoped ADMIN cross-OU directory, whitespace-only query, KB candidate starvation, minimal article projection, stable user order, rate limit, partial dependency failure ni real DB query plan. Nema direktnog backend E2E za `/search` i klik rezultata.

**Status poslije W7.114 (§28): tvrdnja je zastarjela i oba dijela nalaza su zatvorena.**

- **Compile-blocked:** oba delegata koja je tvrdnja imenovala danas postoje u generisanom klijentu —
  `backend/src/generated/prisma/internal/class.ts:521` (`get service()`) i `:731` (`get group()`). CI backend posao
  generiše klijent (`npm run db:generate`) i provjerava ga guardom (`npm run check:prisma-generated`) **prije**
  Jest-a, pa nepotpun klijent obara posao sa uputstvom, a ne izgleda kao „suite se ne kompajlira”. Izvršavanje
  `npx jest src/modules/search` (2026-11-24): **12 suiteova — 11 zeleno, 1 uslovno preskočen
  (`search-query-plan.integration.spec.ts`, 3 testa, traži `PRIVACY_IT_DATABASE_URL`); 103 testa — 100 passed,
  3 skipped, 0 failed**; `search.service.spec.ts` iz tvrdnje izvršio se u cjelini, **26/26**. Pun Jest se izvršava
  u CI-ju (`npm test -- --ci --coverage=false`) i master run `45365051745` je zelen u svih 10 poslova.
- **Direktni E2E:** novi `e2e/tests/60-search-command-palette.spec.ts` (3 testa) dokazuje HTTP ugovor na živom
  rubu — projekcija je tačno `{id, ticketNumber, title}`, prazna grupa nije kvar (`failedGroups` prazan),
  `types=ticket` sužava odgovor, a `400` dobijaju whitespace-only/jednoznakovni upit, ponovljena grupa
  (`types=ticket,ticket`), nepoznata grupa, `limit=26` i nepoznat parametar; bez sesije `401`. Treći test otvara
  paletu header triggerom, čeka red po **broju** tiketa iz ovog runa, klikće ga i tvrdi `/tickets/<id>`, zatvorenu
  paletu i naslov na stranici.

**Šta i dalje nije pokriveno E2E-om (dokumentovano, ne prećutano):** 429 rate-limit budžeta se svjesno ne troši iz
browsera (30/60 s po akteru i 60/60 s po adresi, a svi specovi dijele adresu — prozor, oba bucketa, fail-closed
`503` i `Retry-After` pokrivaju `search-rate-limit*.spec.ts`); confidential/arhiva/merge/revoke ostaju u unit
matrici W7.113; real DB query plan ostaje uslovno preskočen PostgreSQL dokaz.

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
| BA-search-06 | P2       | Modul nasljeđuje KB owner/reviewer scope bypass iz audita 25                            | zatvoreno |
| BA-search-07 | P2       | Nema query-plan/perf dokaza za contains nad user email/name i KB title                  | zatvoreno |
| BA-search-08 | P2       | Jedan dependency kvar ruši sve grupe bez definisanog partial/fail-closed ugovora        | zatvoreno |
| BA-search-09 | P3       | User ordering nema ID tie-breaker pa capped rezultat nije stabilan                      | zatvoreno (W7.110) |
| BA-search-10 | P3       | `types` nema ArrayUnique i ugovor prihvata duplikate                                    | zatvoreno (W7.111) |
| BA-search-11 | P3       | Nema privacy-safe search telemetry, per-group latency/SLO ni incomplete indikator       | zatvoreno (W7.112) |
| BA-search-12 | P3       | Confidential/archive/revoke semantika nema direktan search test                         | zatvoreno (W7.113) |
| BA-search-13 | P3       | Glavni service suite je compile-blocked i nema direktnog `/search` E2E                  | zatvoreno (W7.114) |

## 11. Ključne korekcije

- **01:** riješeno u W7.55 (`user.directory.read` + OU subtree + e-mail samo za globalni doseg); detalji u §15.
- **02:** riješeno u W7.56 (normalizacija prije validacije, brojanje karaktera, granik poslije NFKC); `10` ostaje otvoren.
- **03–04:** riješeno u W7.57 (bounded keyset scan + batch vidljivost + `articlesIncomplete`) i W7.58
  (minimalna projekcija: `body` se ne čita prije autorizacijske odluke); SQL scope pushdown odbijen jer bi
  bio druga kopija autorizacije.
- **05:** riješeno u W7.59 (dva distribuirana fiksna prozora — actor i adresa — sa Redis Lua INCR+EXPIRE,
  per-instance degradacijom i fail-closed `503` kad verdikta nema).
- **07:** riješeno u W7.61 (EXPLAIN na 12k korpusu: direktorij je `Seq Scan` preko cijele tabele jer nema
  trigram indeksa; KB naslov ima `KnowledgeArticle_title_trgm_idx` i dokazano ga koristi uz
  `enable_seqscan = off`. Trigram indeks nad `User` je predložen, ali nije primijenjen — traži odobrenje
  za migraciju.)
- **06:** riješeno u W7.60 (jedna odluka vidljivosti: `isKnowledgeArticleVisibleTo` je batch loader nad jednim
  redom, a detalj i feedback glasovanje koriste isti put; delegacijski rubovi audita 25 dokazani su parity
  matricom i testovima na granici `/search`).
- **08:** riješeno u W7.62 (typed group outcome: `authorization`/`client` uvijek fail-closed, samo
  `availability` degradira uz obavezno `failedGroups`; `503 SEARCH_UNAVAILABLE` kad nijedna grupa nije odgovorila).
- **09,11:** stabilan order i privacy-safe metrički sloj bez raw queryja.
- **12:** ne čita se kao jedan paket — W7.113 je dodao confidential/arhiva/merge/revoke matricu kroz
  `/search` (vidi §27).
- **13:** W7.114 je pokazao da je „compile-blocked” opis **tadašnjeg checkouta** (generisan Prisma klijent bez
  `group`/`service` delegata), a ne koda: delegati danas postoje, CI ih provjerava prije Jest-a, suite je 26/26, a
  direktni `/search` E2E sa klikom rezultata je dodat (§28).

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

## 20. Implementacijski closeout — W7.60 (`BA-search-06`)

**Status nalaza:** `BA-search-06` (P2) **zatvoren**; paket W7.60, kod `61a2ccb`, **bez migracije**.
Detalji: [281](../implementation/281-w760-search-06-visibility-parity.md).

**Šta je bilo:** audit 25 §3 opisao je dvije delegacijske zaobilaznice (owner/owner-group bez scope provjere,
reviewer po jednakosti ID-a). Obje su popravljene u centralnom predikatu — W7.49 (`isKnowledgeDelegationInScope`,
globalni `USER` assignment ne pokriva nijednu OU) i W7.50 (reviewer prolazi isti scope test) — ali `/search` je
odluku donosio **batch** loaderom, dok su detalj i feedback glasovanje sklapali iste činjenice kroz **drugi** put.
Nalaz je zato bio otvoren s pravom: nije bila riječ o pogrešnom pravilu, nego o dvije implementacije istog
pravila, a upravo tako modul ponovo naslijedi zaobilaznicu.

**Šta je sada:** `isKnowledgeArticleVisibleTo` **je** `loadKnowledgeArticleVisibilities` nad jednim redom;
`get-knowledge-article.ts` i `submit-knowledge-feedback.ts` koriste taj isti loader, a lokalno sklapanje predikata
je uklonjeno. Invarijanta je po konstrukciji: članak je vidljiv u `/search` ako i samo ako je vidljiv po ID-u.
Revoke (premještaj OU, drugi servis, `reviewerUserId = null`, uklanjanje iz grupe) važi na sljedećem zahtjevu —
nema keša koji bi ga odgodio.

**Acceptance:** §5 (search ne nasljeđuje delegacijske zaobilaznice) je ispunjen i dokazan na granici `/search`,
ne samo na detalju. Dokaz: parity spec (56 poređenja batch-vs-single + delegacijski rubovi + klasifikacija) i
četiri nova testa u title-search specu.

**Šta ostaje u ovom modulu:** P1 nema. P2: `BA-search-07` (query plan), `08` (partial/fail-closed ugovor). P3:
`09` (stable order), `10` (`ArrayUnique`), `11` (telemetrija), `12` (confidential/arhiva), `13` (E2E za `/search`).

**Preostali rizik:** budući read put koji ponovo sklapa činjenice ručno oborio bi invarijantu (parity spec ga ne
može spriječiti, samo uhvatiti ako koristi loader); široka vidljivost objavljenog `INTERNAL` ostaje proizvodna
odluka iz `BA-knowledge-base-05`; grant snapshot/expiry po članku traži novu tabelu i odobrenje; query plan,
partial ugovor i telemetrija nisu dio paketa.

## 21. Implementacijski closeout — W7.61 (`BA-search-07`)

**Status nalaza:** `BA-search-07` (P2) **zatvoren**; paket W7.61, kod `c255f60`, **bez migracije**.
Detalji: [282](../implementation/282-w761-search-07-query-plan-evidence.md).

**Šta je bilo:** §7 je tvrdio da su `contains` skenovi imenika i KB naslova skupi „bez dokazanog trigram/index
plana”. Dokaza nije bilo nikakvog — ni plana, ni broja pregledanih redova ni mjerenja; postojala je samo namjera
izražena u šemi (trigram indeksi za `Ticket`/`KnowledgeArticle`) i pretpostavka da rade.

**Šta je sada:** real-PostgreSQL suite (`search-query-plan.integration.spec.ts`, u `integrationSpecs`) puni 12k
korisnika i 12k članaka, radi `ANALYZE`, pa mjeri `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` nad SQL-om koji
Prisma izdaje za modul — uz paritet Prisma-vs-raw redova, da plan ne opisuje drugi upit. Rezultat: **imenik se
čita cijeli** (nema `gin_trgm_ops` indeksa nad `User`; B-tree na `email` ne može vodeći wildcard), a **KB naslov
je indeksabilan**: `KnowledgeArticle_title_trgm_idx` postoji i preuzima upit uz `enable_seqscan = off`, sa
čitanjem proporcionalnim pogodcima. Na 12k redova planer legitimno bira sken (~7–15 ms); cijena je linearna u
veličini tabele, što je i bio predmet nalaza.

**Odluka:** trigram indeks nad `User.displayName`/`User.email` je **schema promjena** ⇒ migracija ⇒ traži
izričito odobrenje. Bez odobrenja paket ne mijenja šemu; predlog DDL-a i očekivani efekat su u dokumentu 282.
Interim: W7.59 budžet ograničava broj skenova, W7.55 OU-predikat sužava skup nad kojim se sken izvodi.

**Šta ostaje u ovom modulu:** P1 nema. P2: `BA-search-08` (partial/fail-closed ugovor). P3: `09` (stable order),
`10` (`ArrayUnique`), `11` (telemetrija), `12` (confidential/arhiva), `13` (E2E za `/search`).

**Preostali rizik:** direktorijski sken ostaje O(N) dok migracija nije odobrena; mjerenje je na 12k redova
(zakon rasta dokazan oblikom plana, ne mjerenjem na 100k+); planer nije obavezan koristiti indeks ni kad
postoji, pa bi buduća migracija morala doći s vlastitim plan-dokazom; `Ticket`/`Asset` trigram planovi nisu dio
ovog paketa.

## 22. Implementacijski closeout — W7.62 (`BA-search-08`)

**Status nalaza:** `BA-search-08` (P2) **zatvoren**; paket W7.62, kod `aa57540`, **bez migracije**.
Detalji: [283](../implementation/283-w762-search-08-partial-fail-closed.md).

**Šta je bilo:** `Promise.all` je značio da kvar jedne tražene grupe ruši cijeli odgovor, a audit je tražio
eksplicitnu odluku: fail-closed za autorizaciju, kontrolisani partial za dostupnost — bez prikrivanja security
failurea. Odluka je donesena i implementirana, ne prepuštena tumačenju.

**Šta je sada:** svaka grupa vraća `skipped` / `ok` / `failed`, a klasifikacija je na jednom mjestu
(`search-group-failure.ts`): `authorization` (`401`/`403` ili domenski `FORBIDDEN`/`UNAUTHORIZED`) i `client`
(svaki drugi `4xx` i svaka druga domenska greška) **ruše cijeli zahtjev**; samo `availability` (`5xx`, mreža,
vrijeme, nepoznato) degradira — i tada odgovor nosi `failedGroups` sa imenima grupa, uvijek prisutno. Ako
nijedna tražena grupa nije odgovorila, endpoint vraća `503 SEARCH_UNAVAILABLE` sa istim spiskom umjesto tri
prazne liste. `articlesIncomplete` ostaje zastavica skeniranja grupe koja je odgovorila; pala grupa se nikad ne
prijavljuje kao nepotpuna. Paleta razlikuje `429` (budžet), `503` (nedostupno) i imenovanu palu grupu, i ne
prikazuje „nema rezultata” u ta dva slučaja.

**Acceptance:** §14.6 je ispunjen — security greška nikad nije partial uspjeh, a dostupnosni kvar je kontrolisan,
imenovan i vidljiv i u API-ju i u UI-ju. Dokaz: `search-group-failure.spec.ts` (4), `search.service.spec.ts` (+4),
frontend (+4 testa u tri fajla).

**Šta ostaje u ovom modulu:** P1 nema, **P2 nema**, **P3 nema** — modul je zatvoren W7.114 (`09` stable order,
`10` `ArrayUnique`, `11` telemetrija, `12` confidential/arhiva/merge/revoke matrica, `13` `/search` E2E i dokaz da
„compile-blocked” više ne stoji).

**Preostali rizik:** klasifikacija zavisi od tipova grešaka, pa novi `4xx` izvor treba svjesno klasificirati;
nema per-group timeouta (dostupnost pokriva greške, ne visenje); `failedGroups` nema telemetriju (P3 `11`);
partial je `200` i štiti ga samo polje `failedGroups`.

## 23. Implementacijski closeout — W7.63 (migracija iz `BA-search-07`)

**Status:** paket migracije nad **već zatvorenim** nalazom `BA-search-07` (P2); paket W7.63, kod `92293c8`, CI
[`44619519044`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44619519044) **success**.
Detalji: [284](../implementation/284-w763-user-trigram-index-migration.md).

**Šta je bilo:** §21 je izmjerio da imenik nema indeks koji može poslužiti `ILIKE '%needle%'` i zato predložio
trigram indekse — ali ih nije primijenio, jer je to schema promjena i traži odobrenje. Nalaz je zato zatvoren kao
„dokaz + predlog”, a direktorijski sken je do sada bio O(N) u produkciji.

**Šta je sada:** odobrenje je dato i migracija `20271201130000_user_search_trigram_indexes` isporučuje
`CREATE EXTENSION IF NOT EXISTS pg_trgm` i dva GIN indeksa sa `gin_trgm_ops` (`User_displayName_trgm_idx`,
`User_email_trgm_idx`), građena `CONCURRENTLY` da pisanje u `User` ostane dostupno. Šema ih ogleda kroz
`@@index(..., type: Gin, map: ...)`, pa `prisma migrate diff` ne vidi drift. Sentinel `expectedSchemaMigration`
je pomjeren, tako da readiness odbija bazu koja zaostaje za kodom.

**Acceptance:** §21 je tražio da preporuka ne ostane „hipotetička indeksna grana”. Plan-suite sada **tvrdi** da
oba indeksa postoje u `pg_indexes`, mjeri default plan (koji na 12k redova i dalje smije biti `Seq Scan` — to je
cjenovna odluka, ne nedostatak indeksa) i dokazuje upotrebljivost prisilnim planom: sa `enable_seqscan = off`
indeks preuzima i broj pregledanih redova pada ispod 20 % korpusa. Test se izvršava u CI-ju nad stvarnom bazom,
pa indeksna grana više nije pretpostavka.

**Šta ostaje u ovom modulu:** P1 nema, P2 nema. P3: `09` (stable order), `10` (`ArrayUnique`), `11`
(telemetrija), `12` (confidential/arhiva), `13` (E2E za `/search`). Zbirke se **ne mijenjaju** — nalaz je bio
zatvoren i prije ovog paketa.

**Preostali rizik:** dva dodatna GIN indeksa povećavaju trošak upisa u `User` (rijetko se mijenja, ali directory
sync radi batch update); `email` zadržava i `@unique` B-tree jer trigram indeks ne garantuje jedinstvenost;
trigram rješava **pokrivenost**, ne **relevantnost** — `contains` ostaje substring match; planer na malom imeniku
i dalje može izabrati sekvencijalni sken, pa je stvarni dobitak mjerljiv tek na većem korpusu.

## 24. Implementacijski closeout — W7.110 (`BA-search-09`)

**Nalaz:** imenik (`types=user`) sortirao je samo po `displayName` uz `LIMIT`, a ime nije jedinstveno. Sadržaj
ograničene stranice zavisio je od planera: drugi plan poslije `VACUUM`-a, `UPDATE` koji red pomjera na kraj heapa,
druga replika ili paralelni radnik mogli su za **isti** zahtjev vratiti drugu osobu. To nije kozmetika nego
nereproducibilan skup rezultata — a nijedan test to nije mogao uhvatiti jer ugovor o poretku nije bio definisan.
Article grupa je tie-breaker imala od početka (`updatedAt DESC, id ASC`); imenik je bio jedina bez njega.

**Rješenje.** Sve tri grane `search-users.ts` (scoped OU, „everyone” bez e-maila, „everyone” s e-mailom) koriste
jednu konstantu `directoryUserOrder = [{displayName:'asc'},{id:'asc'}]`. `id` je primarni ključ, pa je poredak
**totalan**, a time i sastav stranice jednoznačan; ako se jednog dana doda kursor, `(displayName, id)` je već
ispravan ključ. Nema promjene ruta (632), DTO-a, scope pravila ni projekcije, i nema migracije — trigram indeksi iz
W7.63 ostaju jedini indeksni put za `ILIKE`, a tie-breaker ne mijenja plan pretrage nego garantuje poredak.

**Testni dokaz.** `search-users.spec.ts` (**novo, 7**): tačan poredak u sve tri grane; scope predikati i projekcija
netaknuti (e-mail samo kad scope dozvoljava); prazan scope ne čita bazu; mapiranje ne prepisuje redoslijed; guard nad
izvornim kodom da nijedan `orderBy` ne može ostati bez tie-breakera. `search-query-plan.integration.spec.ts` (+1,
PostgreSQL): četiri imenjaka, dvije identične stranice od dva reda, **rastući** ID-evi (mogući samo od tie-breakera,
jer je heap poredak poredak umetanja, a `cuid()` nije rastući) i `Sort Key` sa oba ključa; postojeći test imenika
objašnjava isti SQL (`ORDER BY "User"."displayName" ASC, "User"."id" ASC`) i vraća iste ID-eve kao Prisma. Lokalno:
`search` **9 suiteova / 73 testa** (integracioni suite uslovno preskočen bez baze), `nest build` zelen,
`wiring:check` 632, migracije 125.

**Otvoreno i dokumentovano:** tie-breaker ne rješava **relevantnost** (abecedni poredak, ne rang); indeks
`(displayName, id)` nije uveden jer bi koristio samo `ORDER BY` bez `ILIKE` filtera, a sort kandidata je već
izmjeren u plan-suiteu. Ostaju `BA-search-10` (duplikati u `types`), `-11` (telemetrija/SLO), `-12`
(confidential/arhiva testovi) i `-13` (E2E za `/search`). Detalji:
[332-w7110-search-09-directory-order-tiebreaker.md](../implementation/332-w7110-search-09-directory-order-tiebreaker.md).

## 25. Implementacijski closeout — W7.111 (`BA-search-10`)

**Nalaz:** `types` je bio lista, ne skup. `GET /search?types=ticket,ticket` je prolazio validaciju (`@IsArray`,
`@ArrayMaxSize(3)`, `@IsIn(..., { each: true })`) i tek se u servisu gubio kroz `new Set(query.types)`. Ugovor na
ulazu zato nije bio isti kao izvršenje: duplikat je bio legalan zahtjev koji se tiho svodio na jednu grupu, a
`@ArrayMaxSize(searchTypes.length)` je **brojao ponavljanja**, pa je `types=ticket,article,user,user` — tri grupe —
odbijan kao predugačak. Svaki budući potrošač `SearchQuery.types` (telemetrija i SLO po grupi iz `BA-search-11`,
keš ključ) morao je sam znati da niz može sadržavati duplikate.

**Rješenje.** `types` dobija `@ArrayUnique()`; `@Transform` (`toQueryList`) radi prije validacije, pa se csv oblik i
ponovljeni query parametar provjeravaju isto kao ručno građen niz. `toSearchQuery` uvodi `uniqueSearchTypes` (Set uz
redoslijed prvog pojavljivanja), jer se mapiranje poziva i van HTTP puta i ne smije zavisiti od `ValidationPipe`.
Servisov `Set` ostaje treći sloj — isti broj čitanja po grupi, bez promjene semantike, ruta (632) ni oblika odgovora.
Bez migracije.

**Testni dokaz.** `search-query.dto.spec.ts` (+2): csv duplikat, array duplikat i `ticket,article,user,user` daju
grešku na polju `types` sa `arrayUnique` constraintom; tri različite grupe prolaze u poslanom redu; ručno građen DTO
sa `['user','ticket','user']` mapira se u `['user','ticket']`. `search.service.spec.ts` (+1): ručno građen
`SearchQuery` sa `['article','ticket','article','user','user']` čita article grupu jednom i user grupu jednom
(scoped admin, da directory grant postoji), vraća sve tri grupe i prazan `failedGroups`. Lokalno: `search`
**9 suiteova / 76 testa** (integracioni suite uslovno preskočen bez baze), `nest build` zelen, `wiring:check` 632.

**Otvoreno i dokumentovano:** ukupan response budget (75 hitova danas) nije eksplicitan ugovor — veže se na
`BA-search-11`. Ostaju `BA-search-11` (telemetrija/SLO i „incomplete” indikator), `-12` (confidential/arhiva/revoke
testovi) i `-13` (direktni `/search` E2E). Detalji:
[333-w7111-search-10-types-unique.md](../implementation/333-w7111-search-10-types-unique.md).

## 26. Implementacijski closeout — W7.112 (`BA-search-11`)

**Nalaz:** endpoint nije ostavljao nijedan operativni trag — nije se znalo koliko pojedina grupa traje, koliko je
hitova vratila, da li je pala, da li je odgovor odsječen ni da li je zahtjev odbijen. Bez toga nema ni SLO-a (ne može
se reći je li 250 ms cilj prekršen), a `articlesIncomplete`/`failedGroups` iz odgovora nisu imali agregat. Uz to je
audit postavio tvrd uslov (§14.8): telemetrija ne smije čuvati sirov termin, jer je upit slobodan tekst i nosi imena,
hostname-ove i naslove tiketa.

**Rješenje.** Novi čisti ugovor `search-telemetry.ts` definiše šta smije izaći iz procesa: `status`
(`ok`/`partial`/`unavailable`/`rejected`), `query_len` (karakteri), `query_hash` (HMAC-SHA256 uz
`SEARCH_TELEMETRY_SALT`, 16 hex znakova; bez salta proces uzima slučajan, pa hash nikad nije reverzibilan),
`types`, `limit`, `duration_ms`, `latency_bucket` (10/25/50/100/250/500/1000 ms), `search_group_<ime>` u obliku
`state:hits:durationMs:truncated`, `incomplete` i `slo_breaches`. `describeSearchTerm()` je jedini ulaz za termin i
vraća samo `{length, hash}`; formatter nema parametar za sirov tekst, a svaki token linije je `key=value`. Sink
`SearchTelemetry` piše jednu liniju (`warn` na prekršaj, `log` inače) i nikad ne baca. `SearchService` mjeri svaku
granu u `readSearchGroup()` i emituje zapis iz **istih** ishoda iz kojih gradi odgovor, na sva četiri izlaza
(`ok`/`partial`/`unavailable`/`rejected`); kvar sinka ili salta ne mijenja odgovor. `truncated` je `true` kad grupa
vrati tačno `limit` redova ili kad se article scan zaustavi na budžetu — to je serverski „incomplete” signal; API
zadržava `articlesIncomplete` za article grupu. SLO: `ticket` 250 ms, `article` 500 ms, `user` 250 ms, ukupno 900 ms
(grupe rade paralelno, pa ukupno nije zbir). Bez migracije, bez nove rute (632) i bez Redis ključeva.

**Testni dokaz.** `search-telemetry.spec.ts` (**novo, 11**): termin se ne vraća ni kao hex bajtovi, dužina je u
karakterima, hash je determinističan po saltu i različit po drugom saltu, salt fallback je slučajan i nikad prazan,
bucket granice, SLO brojanje (striktno `>`, skipped se ne broji), format linije (svi tokeni `key=value`,
`incomplete=` lista). `search-telemetry.service.spec.ts` (**novo, 4**): `log` za zahtjev u SLO-u, `warn` za prekršaj,
logger koji baca ne ruši `record`, `describeTerm` bez termina. `search.service.spec.ts` (+5): `ok` zapis (dužina,
hash, hitovi), `truncated`/`incomplete`, `partial` sa imenom pale grupe, `503` → `unavailable`, `403` → `rejected`,
pokvaren sink/salt ne mijenja odgovor. Lokalno: `search` **11 suiteova / 96 testa** (integracioni uslovno
preskočen), `nest build` zelen, `app.module.spec`/`worker.module.spec` zeleni, `wiring:check` 632,
`check-env-example` 94 varijable.

**Otvoreno i dokumentovano:** nema `GET /search/metrics/last-hour` ni Redis brojača (linija je izvor za log/metrics
pipeline); `truncated` nije u API odgovoru za ticket/user grupe; nema per-group timeouta (SLO alarmira, ne prekida) —
visenje jedne grupe i dalje drži zahtjev. Ostaju `BA-search-12` (confidential/arhiva/revoke testovi) i `-13`
(direktni `/search` E2E). Detalji:
[334-w7112-search-11-telemetry.md](../implementation/334-w7112-search-11-telemetry.md).

## 27. Implementacijski closeout — W7.113 (`BA-search-12`)

**Nalaz:** ticket grana palete ponovo koristi listu (puni gate, aktuelni archive config, centralni visibility
builder), ali nijedan test nije dokazivao da paleta zaista poštuje naslijeđene semantike — confidential naslov,
arhivu, spojeni tiket i revoke između sesije i pretrage. To je najosjetljivija površina modula: paleta se otvara
jednim `Ctrl+K` i pretražuje sve što akter vidi.

**Rješenje (test-only).** `search.service.spec.ts` dobija blok `ticket semantics the palette inherits (W7.113)` sa
četiri testa; svaki poredi `/search` sa `GET /tickets` za istog aktera i isti svijet. (1) Confidential: `agentIt` u
scope-u bez granta ne dobija ništa na obje površine; requester i assignee dobijaju tiket, a projekcija je tačno
`{id, ticketNumber, title}` — opis ne može iscuriti. (2) Arhiva: paleta ne vraća `ARCHIVED` ni agentu ni
SUPER_ADMIN-u (ne šalje `status` ni `includeArchived`, pa zajednički filter uvijek isključi arhivu), lista ga kroz
`status=ARCHIVED` vraća, a switch `searchable` mijenja listin arhivski pogled — ne paletu; u oba položaja switcha
`/search` ostaje prazan. (3) Spojeni tiket: child ostaje pronađiv (stranica vodi na parenta), lista bez filtera se
slaže, a razlika nastaje samo uz opcioni UI filter `hideMerged=true`. (4) Revoke: suženje assignmenta odmah sužava
odgovor, a ukinut kontekst daje **403**, nikad prazan uspjeh. Harness sada izlaže `archiveConfig`/`confidentialConfig`
da testovi mogu pomjeriti switch bez nove infrastrukture.

**Produkcijski kod nije mijenjan** — nema migracije, nema promjene ruta (632), nema promjene odgovora; paket
dokazuje postojeće ponašanje i pinuje ga protiv tihog regresa. Lokalno: `search` **11 suiteova / 100 testa**
(integracioni uslovno preskočen), `nest build` zelen, `eslint --max-warnings=0` čist, `wiring:check` 632.

**Otvoreno i dokumentovano:** `hideMerged` nije visibility pravilo (paleta prikazuje spojene tikete; mijenjanje toga
je nova odluka); `includeArchived=true` u listi vraća arhivirane tikete i kada je `archive.searchable=false` —
zabilježeno kao kandidat za zaseban nalaz u modulu `tickets`, jer paleta taj parametar ne koristi; break-glass i
allowed-viewer grupe confidential matrice pokrivene su predikatskim specom, ne kroz `/search`. Ostaje `BA-search-13`
(glavni service suite „compile-blocked” i direktni `/search` E2E). Detalji:
[335-w7113-search-12-ticket-semantics.md](../implementation/335-w7113-search-12-ticket-semantics.md).

## 28. Implementacijski closeout — W7.114 (`BA-search-13`)

**Nalaz.** Dva dijela: (1) glavni service suite je u §8 zaveden kao „compile-blocked” zbog nepotpunog generated
Prisma contracta (`group` i `service` delegata), i (2) nije bilo direktnog E2E-a za `GET /search` ni za klik
rezultata u paleti — unit suiteovi dokazuju pravila, ali ne da ih deployani rub (session → role → rate-limit guard,
validation pipe, controller mapping) još poštuje.

**Rješenje (test-only, bez promjene produkcijskog koda).**

1. **Dokaz da je tvrdnja zastarjela, ne prepravka testa.** `backend/src/generated/prisma/internal/class.ts` danas
   nosi `get service()` (l. 521) i `get group()` (l. 731); CI backend posao izvršava `npm run db:generate` →
   `npm run check:prisma-generated` → `npm test -- --ci --coverage=false`, pa nepotpun klijent obara posao sa
   uputstvom umjesto da izgleda kao suite koji se ne kompajlira. Lokalno **2026-11-24**: `npx jest
   src/modules/search` → **12 suiteova (11 zeleno, 1 uslovno preskočen), 103 testa (100 passed / 3 skipped / 0
   failed)**, `search.service.spec.ts` **26/26**; `nest build` zelen, `eslint --max-warnings=0` čist,
   `wiring:check` 632 rute.
2. **Novi E2E `e2e/tests/60-search-command-palette.spec.ts` (3 testa).** (a) HTTP ugovor: tiket iz ovog runa je
   pronađen po naslovu, projekcija je tačno `{id, ticketNumber, title}`, `failedGroups` je prazan, a
   `types=ticket` ostavlja article/user grupe praznim. (b) Refusali na rubu: `q` samo praznine → `400`, jedan znak
   → `400`, `types=ticket,ticket` → `400`, `types=audit` → `400`, `limit=26` → `400`, `sort=title` → `400`
   (`forbidNonWhitelisted`), bez sesije → `401`. (c) Klik kroz paletu: superadmin otvara paletu header triggerom,
   čeka red po **broju** tiketa (jedinstven, pa keširan odgovor ne može proći), klikće i završava na `/tickets/<id>`
   sa naslovom na stranici i zatvorenom paletom.

**Svjesno nije u E2E-u:** 429 budžeta (30/60 s po akteru, 60/60 s po adresi, a svi specovi dijele adresu — trošenje
bi otrovilo kasnije specove; pokriveno `search-rate-limit*.spec.ts`), confidential/arhiva/merge/revoke (W7.113 unit
matrica) i real query plan (PostgreSQL dokaz uslovno preskočen bez `PRIVACY_IT_DATABASE_URL`). Smoke podskup PR-a
(`01,02,03,15,22,54`) ne uključuje `60`; spec se izvršava na dispatchu ciljano i u noćnom punom runu.

**CI.** Push [`45369425277`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45369425277) na `a91cd81`
je zelen u svih 10 poslova (backend `check:prisma-generated` + pun Jest, PostgreSQL/Redis integracija, frontend,
docs guard, container/supply-chain); dispatch
[`45369430547`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45369430547) sa `specs="60"` izvršio je
spec na živom stacku: **Playwright 3 passed / 0 failed / 0 flaky / 0 skipped** (25,3 s), `CI gate` success. Pošto
nepoznat broj speca obara posao prije Playwrighta, zelen dispatch sa `specs="60"` dokazuje da je taj fajl izvršen.

**Produkcijski kod nije mijenjan** — nema migracije, nema promjene ruta (632), nema promjene odgovora ni env ugovora.
Detalji: [336-w7114-search-13-e2e-compile-proof.md](../implementation/336-w7114-search-13-e2e-compile-proof.md).
