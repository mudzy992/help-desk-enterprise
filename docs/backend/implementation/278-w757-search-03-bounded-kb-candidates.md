# Package closeout — W7.57

**Paket:** W7.57 — KB kandidati prije scope filtera sakrivaju vidljive pogotke (`pushdown`/bounded keyset scan + incomplete ugovor)<br>
**Nalaz:** `BA-search-03` (P2) — **zatvoren**<br>
**Kodni commit:** `6d46e07`<br>
**Finalni testani SHA:** `6d46e07`<br>
**CI:** [`44542867198`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44542867198) — zelen (17m03s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `27-search.md` §5 (i §11): article grana `GET /search` uzimala je **najviše `limit × 3`** naslova koji sadrže
needle (`status != ARCHIVED`), sortiranih **globalno** po `updatedAt desc`, pa je tek onda za svaki red pozivala
`isKnowledgeArticleVisibleTo`. Dvije posljedice:

- ako prvih `limit × 3` kandidata (pri `limit` 15 → 45) pripada drugim OU/servisima ili je klasifikovano iznad
  dosega actor-a, actor dobija **praznu ili kratku grupu** iako stariji vidljivi pogoci postoje — fiksni
  multiplikator nije paginacija niti dokaz potpunosti;
- čak i kada je odgovor bio odsječen, **ništa u njemu to nije reklo**: prazna grupa je izgledala isto kao
  „nema takvih članaka”.

Acceptance (audit §14.3 i §14.7): **nijedna vidljiva objava ne smije nestati samo zato što je top-N kandidata
prije scope filtera puno nevidljivih**, čitanje mora ostati **bounded** i bez N+1, a odsječen scan mora biti
**eksplicitno** saopšten (`incomplete`), ne prećutan.

## Implementacija

- **Bounded keyset šetnja** (`search-knowledge-article-titles.ts`): umjesto jednog `findMany` sa
  `take = limit × multiplier`, redovi se čitaju u batch-evima od `knowledgeBaseConstants.listScanBatchSize`
  (50) uz `take: 51` (jedan red je „ima još” signal), najviše `maximumListScanBatches` (4) batcha — dakle
  **najviše 200 kandidata** po zahtjevu, bez obzira na `limit` (1–25).
- **Redoslijed i nastavak**: `orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }]` je totalan poredak, pa se sljedeći
  batch nastavlja **keyset-om** `OR: [{ updatedAt: { lt } }, { updatedAt: jednako, id: { gt } }]` — bez offset
  skena, bez preskočenih i bez duplih redova, i bez zavisnosti od neatributnih kolona. Redovi sa identičnim
  `updatedAt` prelaze granicu batcha tačno jednom (pokriveno testom).
- **Vidljivost po batchu, ne po redu**: batch se filtrira postojećom batch funkcijom
  `loadKnowledgeArticleVisibilities` (jedan servis i jedan group-member upit po batchu) umjesto tri upita po
  redu (`isKnowledgeArticleVisibleTo`). Za 120 nevidljivih kandidata to je 3 upita umjesto 360 — bez N+1.
- **Nastavak poslije nevidljivih redova**: petlja ne staje na prvom nevidljivom kandidatu; skenira dalje dok ne
  napuni `limit` ili ne potroši budget. Time vidljivi pogoci iza nevidljivih više ne mogu nestati.
- **`incomplete` ugovor**: nova funkcija vraća `{ items, incomplete }`. `incomplete` je `true` kada je skeniranje
  stalo prije nego što su svi pogoci pročitani — bilo zato što je `limit` napunjen (u ovom batchu ili iza njega
  ima još redova), bilo zato što je potrošen scan budget. `false` znači da je grupa **iscrpna**. Prazna grupa sa
  `incomplete: false` je dokaz „nema takvih članaka”, a ne pretpostavka.
- **Ugovor `/search`**: `SearchResponse` dobija `articlesIncomplete: boolean`
  (`search.types.ts`). `SearchService` prosljeđuje samo `q` i `limit`
  (`candidateMultiplier` je uklonjen iz `search.constants.ts` jer više nema šta da množi) i vraća
  `articles: articleResult.items`, `articlesIncomplete: articleResult.incomplete`. Nezatražena grupa je
  `{ items: [], incomplete: false }` — „nije tražena” nije „nepotpuna”.
- **Paleta**: `GlobalSearchResponse` i `HeaderSearchGroups` nose isti flag; `toHeaderSearchGroups` ga preslikava
  (`=== true` je jedini način da se uključi — stariji server bez polja zadržava prethodno ponašanje), a komandna
  paleta ispod grupe članaka prikazuje napomenu (`palette.articlesIncomplete`, bs/en) sa uputom na punu
  pretragu baze znanja. Paleta i dalje prikazuje najviše 5 redova po grupi.
- **Test dvostruko**: `create-in-memory-knowledge-article-delegate.ts` (testni double) sada podržava
  `title: { contains, mode }` i `status: { not }`, pa specovi provjeravaju isto `where` koje ide u produkcijski
  upit, a ne zaobilaznu kopiju.
- **Bez migracije** — nema schema promjene; `contains` nad naslovom i dalje nema indeks (`BA-search-07`).

### Namjerne odluke (trade-off)

1. **Nema SQL pushdowna vidljivosti.** Razmatran je DB-side scope predikat („pushdown koliko je moguće”), ali
   vidljivost članka zavisi od klasifikacije, statusa, OU putanje, servisnog dosega, tri permission ključa,
   identiteta vlasnika/recenzenta i članstva u vlasničkoj grupi. SQL ogledalo tog pravila bilo bi **druga,
   divergentna kopija autorizacije** — tačno klasa greške koju audit 25 i `BA-search-06` opisuju. Zato:
   jedan policy (`loadKnowledgeArticleVisibilities`), bounded šetnja umjesto duplog pravila. Pushdown koji je
   **ekvivalentan** JS provjeri već postoji: `status: { not: 'ARCHIVED' }` i `title contains` (bez arhive nema
   vidljivosti, pa je sužavanje u SQL-u sigurno).
2. **Keyset, ne offset.** `skip/take` nad filtrom koji se mijenja između stranica (nove izmjene članaka) daje
   duple i preskočene redove; `(updatedAt, id)` keyset je stabilan i jeftiniji. Cijena: nema „skoči na stranicu
   N”, što ovom endpointu ionako ne treba.
3. **Budget 200, ne „do prvih 25 vidljivih”.** Bez gornje granice bi jedan zahtjev sa puno nevidljivih
   kandidata mogao pročitati cijelu tabelu — to je unbounded scan koji `BA-knowledge-base-04`/W7.52 uklanja.
   200 je isti red veličine koji lista već koristi (`50 × 4`), pa je ponašanje predvidivo i dokumentovano.
4. **Flag je per-grupa (`articlesIncomplete`), ne globalni `partial`.** Samo article grana ima dokazivo
   odsijecanje; ticket i user grupe ostaju nepromijenjenog ugovora (acceptance 5: bez regresije). Generički
   `partial` bi tvrdio više nego što je provjereno — to je posao `BA-search-08`.
5. **`limit` se ne diže.** Više kandidata ne znači više rezultata: grupa i dalje poštuje `limit` (≤ 25).
   `incomplete` je informacija, ne poziv na veći `limit`.
6. **Projekcija reda ostaje puna.** `select` bi smanjio čitanje `body`-ja (`BA-search-04`), ali batch vidljivost
   treba klasifikaciju, status, servis, OU, vlasnika i recenzenta; sužavanje projekcije je zaseban paket sa
   zasebnim dokazom, pa nije „usput” mijenjano.

## Dokaz

- **Novi `search-knowledge-article-titles.spec.ts` (10 testova)**: (1) vidljivi pogodak iza 60 novijih
  nevidljivih kandidata (stari prozor od 24 bi ga propustio) + `incomplete: false`; (2) bounded batching —
  tačno 3 `findMany` poziva, svaki `take: 51`, `orderBy` i keyset `OR` u drugom pozivu, jedan servisni upit po
  batchu (3, a ne 360); (3) scan budget potrošen na 201. redu → `incomplete: true` uz tačno 4 batcha;
  (4) tačno 200 redova → `incomplete: false` (granica je jasna); (5) `limit` 5 od 12 pogodaka → 5 + `incomplete:
  true`, isti korpus sa `limit` 12 → 12 + `incomplete: false`; (6) arhivirani članak nikad ne ulazi u grupu
  (ni za SUPER_ADMIN-a); (7) 60 redova sa identičnim `updatedAt` → `id asc` tie-breaker, bez preskoka i bez
  ponavljanja (i odsijecanje u istoj grupi javlja `incomplete`); (8) case-insensitive needle + fail-closed
  `403` za nepoznatog actora (bez ijednog čitanja); (9) `CONFIDENTIAL` članak druge jedinice nije u IT
  odgovoru, ali jeste u odgovoru agenta te jedinice; (10) paritet sa `list` — requester dobija isti skup ID-eva
  kao iz liste (jedna vidljivost, jedna implementacija).
- **`search.service.spec.ts`**: stub čitaoca vraća `{ items, incomplete }`; postojeći testovi potvrđuju da
  reader dobija samo `{ q, limit }`; novi test: `articlesIncomplete: true` se prenosi, a grupa koja nije tražena
  je `false`.
- **Frontend**: `header-search-match.spec.ts` (+1: flag se preslikava, odsustvo polja = `false`),
  `use-command-palette-search.spec.tsx` (+1: hook prenosi flag kroz debounce),
  `command-palette.spec.tsx` (+1: napomena se prikazuje samo uz `articlesIncomplete`, i nestaje sa `false`).
- Lokalno: backend `src/modules/knowledge-base` + `src/modules/search` **21 suite / 123 testa** zeleno
  (uključujući svih 10 novih); `npx tsc --noEmit` — **nula grešaka u diranim modulima** (ostatak izlaza su
  pre-egzistirajuće `implicit any` greške Prisma stuba u nedirnutim fajlovima); `eslint` nad diranim fajlovima
  čist; frontend `tsc --noEmit` čist, `eslint` i `prettier --check` čisti, `vitest` (3 dira speca + `src/i18n`
  8 suiteova / 48 testova) zelen.

## CI

- [`44542867198`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44542867198) na `6d46e07` —
  **success** (14:21:34Z–14:38:37Z, 17m03s): backend build/lint/full Jest, PostgreSQL + Redis integracija,
  frontend lint/format/testovi/build/bundle budget, Docs guard, container/supply-chain i CI gate. E2E install
  wizard, E2E critical flows i read-only inventory bili su `skipped` (E2E pokreće korisnik, po dogovoru).
- Prvi i jedini pokušaj; nije bilo ispravki poslije pusha.

## Registar nalaza

- Zatvoreni: `BA-search-03` (P2).
- Ostaju otvoreni u `27-search.md`: 10 nalaza, **P1: nema** — P2: `BA-search-04` (minimalna projekcija reda),
  `05` (rate limit/anti-enumeration), `06` (KB owner/reviewer scope), `07` (query plan), `08`
  (partial/fail-closed ugovor); P3: `09` (stable order korisnika), `10` (`ArrayUnique`), `11` (telemetrija),
  `12` (confidential/arhiva test), `13` (E2E za `/search`).

## Migracija, rollout i rollback

Nema migracije. Rollout je aditivan za klijente: `articlesIncomplete` je novo polje, stariji klijenti ga
ignorišu. Rollback: revert `6d46e07` vraća fiksni `limit × 3` prozor i uklanja flag; nema podataka za vraćanje.

**Preostali rizik (dokumentovan):** (1) **aditivna ugovorna promjena** — polje `articlesIncomplete` mora ući u
klijentske tipove; frontend ga već poznaje i tretira odsustvo kao `false`, ali svaki drugi potrošač (npr.
mobilni klijent) treba istu tolerantnost; (2) grupa može biti `incomplete: true` i kada je `limit` pun — to je
tačno, ali korisnik tada vidi samo napomenu, ne i koliko je propustio (brojanje bi zahtijevalo `count` nad
nevidljivim skupom, tj. novi scan); (3) `contains` nad naslovom nema indeks — bounded scan ograničava štetu, ali
query plan je i dalje `BA-search-07`; (4) vidljivost se i dalje odlučuje poslije čitanja reda (uključujući
`body`), što je `BA-search-04`; (5) nema rate limita (`BA-search-05`), pa 200-redni scan po zahtjevu ostaje
ponovljiv teret.

## Sljedeći paket

Sljedeći P2 u `27-search.md` je `BA-search-04` (KB query učitava cijeli red i hidden body prije visibility
odluke) — otvara se kao W7.58.
