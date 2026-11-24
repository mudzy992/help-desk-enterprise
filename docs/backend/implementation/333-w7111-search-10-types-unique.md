# W7.111 — `BA-search-10`: `types` je set, ne bag (`ArrayUnique`)

**Paket:** Val 7, `search`, **P3**<br>
**Nalaz:** „`types` nema ArrayUnique i ugovor prihvata duplikate”<br>
**Kod:** `search-query.dto.ts` (`@ArrayUnique()` nad `types`, dedupe u `toSearchQuery`)<br>
**Specovi:** `search-query.dto.spec.ts` (+2), `search.service.spec.ts` (+1)<br>
**DB migracija:** ne<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** [run `45342785441`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45342785441) ✓ na `cc61414` (push: backend build+test, PostgreSQL/Redis integracija, frontend, docs guard); PR run [`45342808087`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45342808087) ✓ i sa E2E smoke

## Nalaz

`GET /search?types=ticket,ticket` je **prolazio validaciju**. DTO je imao `@IsArray()`, `@ArrayMaxSize(3)` i
`@IsIn([...searchTypes], { each: true })`, ali ne i `@ArrayUnique()`, pa je ponovljena grupa bila legalan zahtjev.
Servis je zatim radio `new Set(query.types)`, pa se duplikat „funkcionalno” gubio — ali to znači da **ugovor na
ulazu nije bio isti kao izvršenje**:

- klijent je mogao poslati `types=ticket,ticket` i dobiti odgovor kao da je poslao `types=ticket`; greška je
  tiho gutana, a ne prijavljena;
- `@ArrayMaxSize(searchTypes.length)` je **brojao duplikate**, pa je `types=ticket,article,user,user` (tri grupe!)
  odbijen kao „predugačak”, dok je `types=ticket,article,user` prolazio — limit je mjerio pogrešnu stvar;
- svaki budući potrošač `SearchQuery.types` (telemetrija, SLO po grupi iz `BA-search-11`, keš ključ) morao je
  sam znati da skup može sadržavati ponovljene vrijednosti.

Nalaz je P3 jer `Set` sprječava stvarnu štetu (nema dvostrukog čitanja grupe), ali ugovor i izvršenje se razilaze —
a to je upravo sloj na koji se kasnije naslanjaju brojanja i keširanja.

## Rješenje

### 1. Ugovor na ulazu

`types` sada nosi `@ArrayUnique()`:

```ts
@IsOptional()
@Transform(({ value }) => toQueryList(value))
@IsArray()
@ArrayUnique()
@ArrayMaxSize(searchTypes.length)
@IsIn(searchTypes, { each: true })
types?: SearchType[];
```

`@Transform` (`toQueryList`) se izvršava **prije** validacije, pa `@ArrayUnique()` gleda već razdvojenu listu: i
`types=ticket,ticket` (csv) i `types=ticket&types=ticket` (ponovljeni parametar) i `['ticket','ticket']` (ručno
graden DTO) daju istu grešku na polju `types` (`400`, `VALIDATION_ERROR`, constraint `arrayUnique`).

### 2. Odbrana u dubinu u mapiranju

`toSearchQuery` više ne prosljeđuje `dto.types` doslovno:

```ts
function uniqueSearchTypes(types: readonly SearchType[]): readonly SearchType[] {
  return [...new Set(types)];
}
```

Mapiranje se poziva i van HTTP puta (testovi, budući interni pozivaoci, jobovi) i ne smije zavisiti od toga da je
DTO prošao `ValidationPipe`. Dedupe čuva **redoslijed prvog pojavljivanja** (`['user','ticket','user']` →
`['user','ticket']`), pa redoslijed grupa u odgovoru ostaje onaj koji je klijent poslao. Servis i dalje drži svoj
`Set` — to je sada treći, najniži sloj, a ne jedini.

### 3. Bez promjene semantike

Nema promjene ruta, scope pravila, limita ni oblika odgovora. `types` bez vrijednosti i dalje znači sve tri grupe.
Mijenja se samo ono što se **odbija** na ulazu i činjenica da `SearchQuery.types` više nikad ne sadrži duplikat.

## Posljedice po ponašanje

- `types=ticket,ticket` → `400` sa greškom na `types` (prije: tiho prihvaćeno i svedeno na jednu grupu).
- `types=ticket,article,user,user` → `400` zbog `arrayUnique` (prije: `400` zbog pogrešnog razloga — `ArrayMaxSize`).
- `types=user,ticket` → i dalje prolazi, redoslijed grupa ostaje `user`, `ticket`.
- Ručno građen `SearchQueryDto` sa duplikatima → mapiranje vraća dedupliciran niz; servis grupu čita **jednom**.

## Dokaz

`search-query.dto.spec.ts` (+2): csv i array duplikati (uključujući `ticket,article,user,user`) vraćaju grešku na
polju `types` sa `arrayUnique` constraintom; tri različite grupe prolaze u poslanom redu; ručno građen DTO sa
`['user','ticket','user']` mapira se u `['user','ticket']`.

`search.service.spec.ts` (+1): ručno građen `SearchQuery` sa `['article','ticket','article','user','user']` čita
article grupu **jednom** i user grupu **jednom** (scoped admin, da directory grant postoji), vraća sve tri grupe i
prazan `failedGroups`.

Lokalno: `search` **9 suiteova / 76 testa** (1 integracioni suite sa 3 testa uslovno preskočen bez
`PRIVACY_IT_DATABASE_URL`), `nest build` zelen, `eslint src/modules/search --max-warnings=0` čist,
`wiring:check` 632, migracije **125**.

## Otvoreno i dokumentovano

- **Nema ukupnog response budgeta.** Sa tri grupe i `limit ≤ 25` maksimum je 75 hitova; ako se jednog dana doda
  četvrta grupa, `ArrayMaxSize` se veže na `searchTypes.length` i dalje drži, ali ukupan budžet odgovora nije
  eksplicitan ugovor — to ostaje dio `BA-search-11` (metrike/SLO).
- **Ostali P3 nalazi `search` modula** (`11` telemetrija/SLO i „incomplete” indikator, `12` confidential/arhiva/
  revoke testovi, `13` direktni `/search` E2E) ostaju otvoreni.
