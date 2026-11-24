# W7.110 — `BA-search-09`: stabilan poredak imenika (`displayName`, `id`)

**Paket:** Val 7, `search`, **P3**<br>
**Nalaz:** „User ordering nema ID tie-breaker pa capped rezultat nije stabilan”<br>
**Kod:** `search-users.ts` (jedan `directoryUserOrder` za sve tri grane scope-a),
`search-query-plan.integration.spec.ts` (objašnjeni SQL i parity upit nose oba ključa + nov test stabilnosti)<br>
**Specovi:** `search-users.spec.ts` (**novo, 7**), `search-query-plan.integration.spec.ts` (+1, PostgreSQL)<br>
**DB migracija:** ne<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** [run `45288027411`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45288027411) ✓ na `6f1dc6c` (push: backend, frontend, integracija, docs guard; Prettier gate nad npm-audit artefaktom popravljen u istom PR-u #12)

## Nalaz

`GET /search?types=user` je vraćao imenik sortiran **samo** po `displayName` (`ORDER BY "User"."displayName" ASC`)
uz `LIMIT` iz zahtjeva (do 25). Ime nije jedinstveno — u svakoj firmi postoje imenjaci — pa je sadržaj **ograničene
stranice** zavisio od planera, a ne od ugovora:

- drugačiji plan (npr. poslije `VACUUM`-a ili promjene statistike) može poslužiti iste imenjake u drugom redu;
- `UPDATE` reda ga pomjera na kraj heapa, pa sekvencijalni sken istu stranicu vrati u drugom sastavu;
- paralelni radnici i replike mogu vratiti drugu stranicu za **isti** zahtjev.

Posljedica nije „ružan redoslijed” nego **nereproducibilan skup**: korisnik osvježi pretragu i dobije drugu osobu
na listi, a nijedan test to nije mogao uhvatiti jer je ugovor bio nedefinisan. Article grupa je od početka imala
tie-breaker (`updatedAt DESC, id ASC`); imenik je bio jedina grupa bez njega.

## Rješenje

### 1. Jedan poredak za sve grane

`search-users.ts` ima tri `findMany` grane (scoped OU, „everyone” bez e-maila, „everyone” s e-mailom). Sve tri sada
koriste **istu** konstantu:

```ts
const directoryUserOrder: Prisma.UserOrderByWithRelationInput[] = [
  { displayName: 'asc' },
  { id: 'asc' },
];
```

`id` je primarni ključ, pa je poredak **totalan**: za bilo koja dva reda postoji tačno jedan poredak, a time i tačno
jedan sastav ograničene stranice. Konstantu drži jedan objekat da se grane ne mogu razići — test to i provjerava
(čita izvorni kod modula i traži da svaki `orderBy` koristi `directoryUserOrder`).

### 2. Dokaz na tri nivoa

1. **Unit (ugovor):** `search-users.spec.ts` hvata argumente svakog `findMany` poziva i tvrdi tačan poredak
   (`[{displayName:'asc'},{id:'asc'}]`) u sve tri grane, plus da scope predikati i projekcija (e-mail samo kad
   scope dozvoljava) nisu dirani.
2. **Ponašanje (PostgreSQL):** novi test u `search-query-plan.integration.spec.ts` pravi **četiri imenjaka**, traži
   stranicu od dva reda dva puta i tvrdi da su ID-evi **identični i rastući**. Rastući ID-evi među istim imenima
   mogu doći samo od tie-breakera — heap poredak je poredak umetanja, a `cuid()` nije rastući.
3. **Plan (PostgreSQL):** isti test objašnjava **stvarni** SQL modula i, kada plan ima `Sort`, traži da `Sort Key`
   sadrži i `displayName` i `id`. Objašnjeni SQL je od sada `ORDER BY "User"."displayName" ASC, "User"."id" ASC`,
   pa parity upit (Prisma) i objašnjeni upit vraćaju isti niz ID-eva — plan ne može opisivati upit koji modul ne
   izvršava.

### 3. Bez promjene semantike

Nema promjene ruta, DTO-a, scope pravila, projekcije ni limita. Mijenja se samo `ORDER BY`: isti redovi, isti
filteri, ali definisan poredak. Bez migracije — trigram indeksi iz W7.63 ostaju jedini indeksni put za `ILIKE`;
tie-breaker ne mijenja plan pretrage nego samo garantuje poredak rezultata.

## Posljedice po ponašanje

- Ista pretraga vraća **isti** sastav stranice, bez obzira na plan, vacuum, repliku ili vrijeme.
- Imenjaci se prikazuju u stabilnom redu (po ID-u), pa se rezultat može porediti između zahtjeva i keširati.
- Ako se jednog dana doda paginacija/kursor, `(displayName, id)` je već ispravan ključ; bez njega bi kursor
  preskakao ili duplirao imenjake.

## Dokaz

`search-users.spec.ts` (**novo, 7**): poredak u sve tri grane; scope/grana projekcije netaknuta; prazan scope ne
čita bazu; redoslijed iz baze se ne prepisuje u mapiranju; guard nad izvornim kodom da nijedan `orderBy` ne može
ostati bez tie-breakera. `search-query-plan.integration.spec.ts` (+1, PostgreSQL): četiri imenjaka, dvije identične
stranice, rastući ID-evi i `Sort Key` sa oba ključa; postojeći test imenika sada objašnjava SQL sa oba ključa.

Lokalno: `search` **9 suiteova / 73 testa** (1 integracioni suite sa 3 testa uslovno preskočen bez
`PRIVACY_IT_DATABASE_URL`), `nest build` zelen, `wiring:check` 632, migracije **125**.

## Otvoreno i dokumentovano

- **Tie-breaker ne rješava relevantnost.** `displayName` ostaje abecedni poredak, ne rang; ako se jednog dana traži
  rangiranje (npr. prefiks prije substringa), to je nova odluka i nov nalaz (`BA-search-11` je metrički sloj).
- **Nema novog indeksa.** `(displayName, id)` se realizuje sortom u memoriji nad kandidatima; na 12k imenika to je
  već izmjereno u plan-suiteu. Indeks `(displayName, id)` bi koristio samo `ORDER BY` bez `ILIKE` filtera — nije
  potreban za ovaj nalaz i ne uvodi se bez mjerenja.
- **Ostali P3 nalazi `search` modula** (`10` duplikati u `types`, `11` telemetrija/SLO, `12` confidential/arhiva
  testovi, `13` E2E za `/search`) ostaju otvoreni.
