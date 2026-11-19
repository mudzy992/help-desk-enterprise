# Package closeout — W7.52

**Paket:** W7.52 — ograničeni, straničeni readovi baze znanja (list + portal + Teams kartica)<br>
**Nalaz:** `BA-knowledge-base-04` (P1) — **zatvoren**<br>
**Kodni commit:** `7320708` (logika) + `5a2be30`/`1703639` (CI korekcije)<br>
**Finalni testani SHA:** `1703639`<br>
**CI:** [`44509139382`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44509139382) — zelen (16m05s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `25-knowledge-base.md` §5: `GET /articles` nije imao ni cursor ni limit — Prisma i full-text put učitavali su
**sve** matching ID-eve/recorde, a tek onda batch visibility, freshness, glasove i labele. Portal
`visiblePublished` učitavao je cijeli published korpus za home, kategorije i insights, pa je svaki zahtjev trošio
memoriju, DB rezultat i autorizacijski rad proporcionalno veličini korpusa, bez gornje granice. Kategorije su
također neograničene (iako je očekivani broj mali).

Acceptance: nijedan read ne učitava neograničen korpus; straničenje mora imati stabilan red, `hasMore` ugovor i
eksplicitnu granicu rada po zahtjevu; scope pushdown „gdje je moguće“; bez migracije.

## Implementacija

- **Ugovor liste.** `GET /knowledge-base/articles?limit&cursor` vraća
  `{ items, hasMore, nextCursor }`. `limit` je 1..100 (default 25, DTO `@Max`, servis dodatno klampuje),
  `cursor` je neprozirni base64url token. `total` **nije** dio ugovora: tačan total nad autorizacijski
  filtriranim skupom tražio bi upravo onaj neograničeni skan koji paket uklanja — `hasMore` je ugovor.
- **Keyset, ne offset.** Red je `(updatedAt desc, id asc)`; sljedeća stranica nastavlja striktno poslije
  zadnjeg **vraćenog** reda (`OR: [{updatedAt: {lt}}, {updatedAt, id: {gt}}]`). Redovi koji su pročitani ali nisu
  stali u stranicu serviraju se ponovno, pa nema preskakanja ni duplikata. Full-text pretraga ima rank redoslijed
  bez keyseta, zato je tamo offset straničenje sa tvrdim `maximumSearchOffset` (1000); neispravan ili
  prekoračen cursor → `INVALID_CURSOR` (400).
- **Granica rada po zahtjevu.** Skan ide u batchevima od `listScanBatchSize` (50) i staje nakon
  `maximumListScanBatches` (4) — najviše **200 redova** iz baze po zahtjevu, bez obzira na veličinu korpusa.
  Vidljivost se i dalje računa jednom batch-funkcijom (`loadKnowledgeArticleVisibilities`) nad tim prozorom.
- **Filter unutar skana.** `staleOnly` se primjenjuje kao `accept` predikat unutar skana, pa filtrirana stranica
  ostaje puna; ranije se filter izvršavao **poslije** rezanja stranice i mogao je vratiti praznu stranicu uz
  `hasMore: true`.
- **Portal.** `GET /portal/categories/:id/articles?limit&cursor` vraća `{ items, hasMore, nextCursor }`
  (default 20). Home i insights rade nad ograničenim skanom (`portalHomeScanCap` = 200); home uz to vraća
  `articleCountsComplete: false` kad korpus prelazi cap, a UI prikaže „Brojevi su donja granica…“. Time su
  i `faq` i `uncategorizedCount` i `mostViewed`/`lowestRated`/`notViewed` ograničeni, a ne „cijeli korpus“.
- **Teams bot.** `TeamsQueriesService.search()` konzumira stranicu sa `limit: personal` i prikazuje
  „Prikazano N; ima još rezultata.“ (`shownOfMore`) kada stranica nosi `hasMore`; tačan total više nije poznat
  i kartica to ne tvrdi.
- **Frontend.** `listKnowledgeArticles()` i `listKnowledgeCategoryArticles()` vraćaju stranicu; konzola i portal
  imaju „Učitaj još“ (cursor se čuva u state-u), a brojači u podnaslovu konzole se prikazuju samo kad je lista
  kompletna (`nextCursor === null`) da ne podcjenjuju stanje. Playbook picker traži prvu stranicu sa `limit: 100`.
- **In-memory double.** Delegat sada podržava `take`, `OR` i keyset/comparison predikate (`id: {gt}`,
  `updatedAt: {lt|gt}`), a sortiranje poredi `Date` po vremenu i brojeve numerički. Bez toga se granica skana
  i keyset u testovima ne bi mogli dokazati.
- **E2E.** `34-knowledge-portal.spec.ts` helper za kategoriju čita `page.items` (ugovor je promijenjen).

### Namjerne odluke (trade-off)

1. **Nema scope pushdown-a u SQL.** Vidljivost članka je jedna odluka u `canReadKnowledgeArticle` (permission +
   OU putanja + servis + vlasništvo + klasifikacija). Dupliranje tog pravila u `WHERE` bi vratilo upravo
   divergenciju koju su W7.49/W7.50 uklonili. Zato je granica **rad po zahtjevu** (200 redova), a ne upit.
2. **Nema egzaktnog `total`-a** za autorizacijski filtriranu listu (vidi gore) — `hasMore` je ugovor.
3. **Portal kategorija je sada `updatedAt desc`** (stabilan red za keyset) umjesto ranijeg sortiranja po naslovu
   u memoriji; sortiranje po naslovu nije bilo moguće straničiti bez učitavanja svega.
4. **Home brojevi su lower bound** iznad capa i to je eksplicitno u odgovoru (`articleCountsComplete`) i u UI-ju.

## Direktni testni dokaz

- `knowledge-base.pagination.spec.ts` (6 testova, novo): prolazak kroz 5 članaka stranicu po stranicu bez
  praznina/duplikata (3 stranice), klampovanje `limit` (0 → 1, 5000 → 100), **budžet skana** (300 članaka,
  svaki `findMany` ≤ 51 red i ≤ 4 poziva, stranica od 100 uz `hasMore`), filter unutar skana (60 svježih +
  1 zastario → stranica od 1 vraća zastarjeli), `INVALID_CURSOR` za neispravan i prekoračen offset cursor,
  keyset round-trip.
- `portal/knowledge-portal.service.spec.ts` (+2): stranica kategorije (2 + 1, bez preklapanja, `hasMore`
  prelazi u `false`) i `articleCountsComplete: false` za korpus iznad capa.
- Postojeći specovi prilagođeni ugovoru (`items`): authorization, delegation, list-filters, visibility-batch.
- Backend: **17 suiteova / 71 test** za `knowledge-base`, **167** za `knowledge-base` + `teams`.
- Frontend: `tsc -b` čist, eslint čist, **460 fajlova / 1820 testova**; `i18n:check` (4683 ključa u oba jezika)
  i docs guard prolaze.

## CI i testni dokaz

CI run [`44509139382`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44509139382) na `1703639`:

- **Backend build + test / PostgreSQL + Redis integration / Frontend build + test / Docs guard / CI gate:** uspješno.
- **Backend container + supply chain:** uspješno (W7.50 digest i openssl floor netaknuti).
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard`.
- **Neuspjeli pokušaji (dokumentovano):**
  1. `44507237064` na `7320708` — `nest build`: `KnowledgeArticlePageResponse` nije bio importovan u servisu i
     `TeamsQueriesService` je još tretirao listu kao niz (`articles.slice`). Korekcija `5a2be30`.
  2. `44508459727` na `5a2be30` — `nest build` TS4058: rekurzivni `OR` predikat je učinio tip `ArticleWhere`
     neimenljivim u izvedenom return tipu in-memory Prisma-e. Korekcija `1703639` (eksportovan tip).
  3. `44509139382` na `1703639` — **zelen**.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-04` (P1).
- Ostaju otvoreni u `25-knowledge-base.md`: 14 nalaza, **P1: nema** (preostali `05`–`19` su P2/P3).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Ugovorna promjena: `GET /articles` i portal kategorija vraćaju
`{ items, hasMore, nextCursor }` umjesto niza — stari klijent bi dobio objekt umjesto niza, pa frontend i E2E
helper idu u istom commitu. Rollback: revert `7320708` vraća neograničene readove (i stare oblike odgovora);
nema podataka za vraćanje.

**Preostali rizik (dokumentovan):** stranica može biti „tanka“ ako je u prozoru mnogo nevidljivih redova
(npr. stroga OU granica) — `hasMore` je tada i dalje tačan, a klijent nastavlja kursorom. Full-text pretraga
dublja od 1000 rezultata traži precizniji upit. INTERNAL vidljivost (`BA-knowledge-base-05`), intercept
resolution (`06`), feedback atomika (`07`), placement/category (`09`, `10`), reminder/scheduler (`12`, `13`),
privatnost (`14`) i hard delete (`15`) nisu dio ovog paketa.

## Sljedeći paket

**W7.53 — `BA-reports-01` (P1).**
