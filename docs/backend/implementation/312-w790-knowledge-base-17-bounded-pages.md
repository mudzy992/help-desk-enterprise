# W7.90 — `BA-knowledge-base-17`: portal liste imaju stranu, `hasMore` i cursor umjesto tihog reza

**Paket:** Val 7, `knowledge-base`, **P3**<br>
**Nalaz:** „Insights comments hard-limit 50 i category/list API nemaju cursor/hasMore”<br>
**Kod:** `knowledge-base/knowledge-base.constants.ts` (`defaultInsightsCommentPageSize: 20`,
`defaultCategoryPageSize: 50`), novo `knowledge-base/portal/knowledge-portal-pagination.ts` (dva keyset
codec-a), `knowledge-base/portal/knowledge-categories.ts` (`listKnowledgeCategoryTree`,
`findKnowledgeCategory`, `listKnowledgeCategoryChildren`, `KnowledgeCategoryPage`),
`knowledge-base/portal/knowledge-portal.service.ts` (`categories()` vraća stranu, nova
`insightsComments()`, `openComments` je strana, `home.categoriesComplete`, `categoryArticles` čita samo
kategoriju koju pita), `knowledge-base/portal/knowledge-portal.controller.ts` (`limit`/`cursor` na
`categories`, nova ruta `GET insights/comments`); frontend `services/knowledge-portal-api.ts`
(`KnowledgeCommentPage`, `KnowledgeCategoryPage`, `listAllKnowledgeCategories`, `listKnowledgeInsightComments`),
`components/knowledge-base/portal/knowledge-insights-panel.tsx` (signl + „učitaj još”), `knowledge-portal-home.tsx`,
`knowledge-placement-card.tsx`, `knowledge-categories-manager.tsx`, `article-from-reply-sheet.tsx`; i18n
`knowledgeBase.portal.categories.truncated`, `…insights.commentsTruncated`, `…insights.loadMoreComments`
(bs/en)<br>
**DB migracija:** nema<br>
**CI:** `45059137790` na `efa042c` — **success** (Docs guard, Backend build+test, Backend PostgreSQL + Redis
integration, Frontend build+test, Backend container + supply chain, CI gate; E2E i inventory skipped po
politici grane)

## Nalaz

Portal je imao tri liste koje su tvrdile da su potpune:

1. **Komentari u `insights`** — `findMany({ …, take: 50 })`, bez `hasMore`, bez cursora, bez ijednog signala u
   odgovoru. Kurator koji ima 120 otvorenih komentara vidio je prvih pedeset i **nije imao načina da sazna**
   da ih je još sedamdeset. To nije „limit”, to je tvrdnja da je lista potpuna.
2. **`GET /knowledge-base/portal/categories`** — vraćao je **cijeli** niz kategorija, bez `limit`/`cursor`.
   Taksonomija je danas mala, ali API je obećavao „sve” i trošio se bez granice; svaki picker (placement,
   manager, draft-from-reply) je učitao sve i pretpostavljao da je to sve.
3. **`GET …/categories/:id/articles`** je već imao cursor/`hasMore` (W7.52), pa je nalaz bio o konzistentnosti,
   ne o izmišljanju novog ugovora.

Uz to je `categoryArticles()` za **jednu** kategoriju čitao **cijelu** taksonomiju da bi izračunao koje joj
pripadaju — isti obrazac „učitaj sve pa filtriraj u memoriji” koji je W7.52 uklonio sa liste članaka.

## Rješenje

**Svaka lista koja se reže ima stranu sa `hasMore` + `nextCursor`; cursor je keyset, ne offset.**

### Kategorije: strana se broji u korijenima

`listKnowledgeCategoryTree(prisma, { includeArchived, limit, cursor })`:

1. keyset nad **korijenima** (`parentId: null`), red `(sortOrder asc, nameBs asc, id asc)`, `take: limit + 1`
   (jedan red više samo da se zna da li ima još);
2. djeca se dohvate **za korijene na strani** (`parentId: { in: […ids] }`), istim redom — nikad „sva djeca
   cijele taksonomije”;
3. `nextCursor` postoji **samo** kad `hasMore`; prazan/odsutan cursor znači prva strana; nečitljiv cursor je
   `INVALID_CURSOR`, ne prazna strana.

Strana je u korijenima zato što je drvo ograničeno na dva nivoa: korijen bez svoje djece nije strana, a
korijen sa djecom mora doći s njima (inače bi UI morao da spaja dvije strane da bi prikazao jedan čvor).

### Komentari: keyset po `(createdAt desc, id desc)`

`openCommentsPage` (privatno, koriste ga i `insights` i nova `insightsComments`):

- autorizacioni skup se **ponovo računa** na svakoj strani (isti bounded scan `portalHomeScanCap` + `canWrite`
  po članku), pa „učitaj još” ne može proširiti ono što kurator smije vidjeti;
- filter `comment: { not: null }`, `commentResolvedAt: null`;
- `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, `take: limit + 1`;
- nastavak: `createdAt < cursor.createdAt` **ili** (`createdAt = cursor.createdAt` i `id < cursor.id`).

**Zašto keyset, a ne offset:** kurator između dva klika označi komentar riješenim. Red tada **izlazi iz
filtera**, pa bi `skip`/`take` preskočio prvi komentar sljedeće strane — komentar bi nestao bez traga. Keyset
nastavlja „poslije ovog reda”, pa brisanje iz skupa ne mijenja poziciju. To je i direktno testirano (vidi
dokaz).

### Limiti

`resolvePageSize` (W7.52) je i dalje jedini autoritet: `limit` iz query stringa se clamp-uje na
`maximumListPageSize` (100), `NaN`/odsutan daje default (kategorije **50**, komentari **20**), `< 1` daje `1`.
Dva nova imena u `knowledgeBaseConstants` postoje da default ne bude magični broj u servisu.

### Frontend: signal, ne pretpostavka

- **`KnowledgeInsightsPanel`** — `openComments` je `{ items, hasMore, nextCursor }`; kad `hasMore`, panel
  ispiše „Prikazano prvih N otvorenih komentara.” i dugme **„Učitaj još komentara”** koje dovuče sljedeću
  stranu kroz `GET insights/comments?cursor=…` i **doda** je (bez reload-a i bez dupliranja). Resolve i dalje
  reload-uje prvu stranu — to je namjerno: riješen komentar treba da nestane.
- **Pickers** (`knowledge-placement-card`, `knowledge-categories-manager`, `article-from-reply-sheet`) traže
  **cijelu** taksonomiju, pa `listAllKnowledgeCategories` hoda strane (100 korijena × najviše 10 strana) i
  vraća `{ items, truncated }`. Kad cap bude dostignut, kartica i manager to **kažu** (novi i18n ključ) umjesto
  da se prave da je lista potpuna; draft-from-reply koristi prvih 1.000 korijena (cap je daleko iznad realne
  taksonomije, i to je zapisano u docblock-u helpera).
- **`knowledge-portal-home`** — `home.categoriesComplete === false` prikazuje isti hint, pored postojećeg
  `countsPartial` (W7.52).

### `categoryArticles` više ne čita cijelu taksonomiju

- konkretna kategorija: `findKnowledgeCategory` (jedan red) + `listKnowledgeCategoryChildren` (djeca tog
  korijena, bez arhivirane djece) — dva uska čitanja umjesto jednog širokog;
- `uncategorized`: dohvati **samo** arhivirane kategorije (`select: { id }`) i tretiraj njihove članke kao
  bez kategorije — ista semantika kao ranije (`categoryId` van aktivnog skupa), bez učitavanja aktivnog drveta;
- arhivirana kategorija **nije** portal strana: `CATEGORY_NOT_FOUND`, kao i prije paketa (ranije zato što je
  nije bilo u aktivnoj listi, sada eksplicitno).

### Zašto ne drugačije

- **Zašto ne offset paginacija?** Vidi gore: filter se mijenja između strana (resolve komentara), pa offset
  preskače redove. Keyset je isti broj upita i nema taj kvar.
- **Zašto ne „vrati sve, ali sa `total`”?** `total` bi bio drugi upit i druga istina; `hasMore` + cursor je
  ono što UI stvarno koristi (dugme „učitaj još”), a ne broj koji zastari odmah poslije odgovora.
- **Zašto strana u korijenima, a ne u svim čvorovima?** Dvije razine: strana u čvorovima bi mogla presjeći
  korijen od njegove djece, pa bi UI dobio „VPN ›” bez „Mreža”. Strana u korijenima je jedinica koju UI
  prikazuje.
- **Zašto `INVALID_CURSOR`, a ne prva strana?** Cursor je jedini pokazatelj gdje je korisnik bio. Ako se ne
  može pročitati, tiho vraćanje prve strane bi značilo beskonačno „učitaj još” bez pomaka; greška je vidljiva
  i testirana.
- **Zašto ne mijenjati `GET categories` u potpuno novu rutu?** Stari oblik je vraćao goli niz; novi vraća
  stranu. Jedini potrošači su u ovom repou (tri pickera) i svi su ažurirani u istom paketu; `/api` nije javni
  ugovor prema trećim stranama (vidi audit §3).

### Cijena

- Kategorije: +1 upit po strani (djeca), umjesto 1 upita za sve — za tipičnu taksonomiju (<50 korijena) ista
  cijena, a za veliku linearno sa stranom.
- Komentari: `canWrite` po članku se i dalje računa (to je postojeći obrazac iz `insights`); „učitaj još”
  ponavlja taj izračun. Za kuratora sa bounded scanom (200 članaka) to je isti trošak kao prvi poziv.

## Direktni testni dokaz

**`knowledge-portal-pagination.spec.ts` (novo, 4):** round-trip komentara (`createdAt` + `id`) i kategorije
(`sortOrder` + `nameBs` + `id`); odsutan/prazan cursor ⇒ `null` (prva strana); nečitljiv JSON, pogrešan oblik,
prazan `id` i ne-brojni `sortOrder` ⇒ `INVALID_CURSOR`.

**`knowledge-portal.service.spec.ts` (17 → 23, +6):**

- komentari: tri komentara, `limit: 2` ⇒ `['f2','f1']`, `hasMore`, `nextCursor`; **između strana se `f1`
  označi riješenim** i druga strana vraća `['f0']` — dokaz da keyset ne preskače red (offset bi ga preskočio);
  `insights` nudi isti feed i vidi da je riješeni komentar nestao;
- `defaultInsightsCommentPageSize + 1` komentara ⇒ prva strana ima tačno 20, `hasMore: true`, `nextCursor`
  nije `null` (prije paketa: 50 redova i tišina);
- `insightsComments` je `FORBIDDEN` za ne-kuratora (isto kao `insights`);
- drvo: tri korijena + jedno dijete + arhivirani korijen, `limit: 2` ⇒ `['root-a','root-b','child-a1']` (strana
  se broji u korijenima), druga strana `['root-c']`, `hasMore: false`; `includeArchived` sa čitaocem **ne**
  prikazuje arhivirani korijen, sa `SUPER_ADMIN` prikazuje;
- home: `defaultCategoryPageSize + 1` korijena ⇒ `categories.length === 50`, `categoriesComplete === false`;
- `uncategorized` sada uključuje članke arhivirane kategorije, a `categoryArticles('gone')` je
  `CATEGORY_NOT_FOUND`.

**In-memory fakeovi su ojačani, ne zaobiđeni:** `create-in-memory-knowledge-feedback-delegate.ts` sada
primjenjuje `orderBy`/`take` i razumije `comment: { not: null }`, `commentResolvedAt: null`, `OR` i `id.lt`
(prije ih je **ignorisao** — test bi prošao i sa pokvarenom paginacijom); fake kategorija u
`knowledge-portal.service.spec.ts` čita `{ in }`, `null`, `OR`, `take`, `orderBy` i `select`. To je isti
princip kao W7.85: dvostruki klijent mora odbiti ono što bi pravi klijent odbio.

**`knowledge-insights-panel.spec.tsx` (novo, 2):** panel ispiše „prikazano prvih 2” i dugme, klik dovuče
sljedeću stranu kroz `{ cursor: 'cursor-1' }`, lista naraste na 3 reda (bez duplikata) i hint nestane; kad je
prva strana ujedno i posljednja, dugmeta nema.

**`knowledge-placement-card.spec.tsx`:** mock prebačen na `{ items, truncated }`.

**Lokalno:** backend **940 suite / 5.404 testa** (314 skipped: integracije bez baze), frontend **474 fajla /
1.890 testova**, `eslint`, `tsc` i `prettier` zeleni; `i18n:check` **9.295 ključeva**, bs/en parity.

## CI i testni dokaz

Run **`45059137790`** na `efa042c` je zelen u svim jobovima koji se izvršavaju: **Docs guard**, **Backend build +
test**, **Backend PostgreSQL + Redis integration**, **Frontend build + test**, **Backend container + supply
chain**, **CI gate**; `E2E critical flows`, `E2E install wizard` i `Read-only service-form pattern inventory` su
`skipped` po politici grane.

Tri stvari su ispale na putu do zelenog, i sve tri su bile u **dokazu i mehanici**, ne u modelu stranica:

1. **Wiring manifest je snapshot.** Nova ruta `GET /knowledge-base/portal/insights/comments` je promijenila
   broj ruta (631 → 632), pa je `Verify route/guard and root-module wiring snapshot` pao. Manifest je
   regenerisan sa `npm run wiring:write`; ruta je `authenticated` sa `SessionAuthenticationGuard`, kao i
   ostatak portala.
2. **Rekurzivan tip se ne može emitovati bez imena.** `FeedbackWhere` je u ovom paketu dobio `OR?:
   FeedbackWhere[]`, a TypeScript tada ne može da „raspiše” tip u deklaraciji — `nest build` je pao sa
   `TS4058: ... 'FeedbackWhere' ... cannot be named` na tri harness fabrike. Tip je izvezen (`export type
   FeedbackWhere`), što je i tačnije: dvostruki klijent sada ima imenovan ugovor filtera.
3. **Prazan `?limit=` nije nula.** `Number('')` daje `0`, pa bi „pošalji limit bez broja” tiho vratio **jedan**
   red. Nove rute sada tretiraju prazan `limit` kao odsutan (`readLimit`), pa default (50/20) važi.

Lokalno (bez baze, integracije skip-ovane): backend **940 suite / 5.404 testa**, frontend **474 fajla / 1.890
testova**, `eslint`, `tsc` (sa uključenim `declaration` emitom — provjera TS4058 klase) i `prettier` zeleni,
`i18n:check` **9.295 ključeva**, `wiring:check` 632 rute, `audit:traceability` 696/696.

## Registar nalaza

`BA-knowledge-base-17` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 25](../audits/25-knowledge-base.md#16-tabela-nalaza). Zbirovi poslije zatvaranja: **308 zatvoreno /
388 otvoreno / 696**; Val 7 **87 / 24 (0/12/12)**, `knowledge-base` **17/19**.

## Migracija, rollout i rollback

Migracije nema. **API se mijenja na dvije rute**, pa redoslijed deploya nije proizvoljan:

- `GET /knowledge-base/portal/categories` vraća `{ items, hasMore, nextCursor }` umjesto niza;
- `GET /knowledge-base/portal/insights` vraća `openComments` kao stranu umjesto niza;
- nova ruta `GET /knowledge-base/portal/insights/comments` (`limit`, `cursor`).

Frontend i backend su isti deployment (SPA + API iz iste release slike), pa nema perioda u kojem stari UI
razgovara sa novim API-jem. Ko ima keširan stari bundle, dobiće grešku prikaza kategorija i osvježiće stranicu;
nema tihe korupcije podataka. Rollback je vraćanje fajlova — stare rute nemaju stanje, pa nema migracije
podataka ni „naprijed-nazad” problema.

**Preostali rizik (dokumentovan):**

- **cap hoda pickera je 1.000 korijena** (`listAllKnowledgeCategories`): iznad toga picker radi sa prvih 1.000 i
  to **kaže** (kartica + manager). Draft-from-reply koristi prvih 1.000 bez posebnog teksta — cap je daleko
  iznad realne taksonomije (drvo je dva nivoa, ručno održavano), i tako je zapisano u helperu;
- **`openComments` se računa iz bounded scana** (`portalHomeScanCap` članaka): komentar na članku van scana se
  ne pojavljuje ni u jednoj strani. To je postojeće W7.52 ograničenje `insights`-a, sada eksplicitno: signal
  `articleCountsComplete` na home-u i `hasMore` na feed-u ne tvrde „svi komentari sistema”;
- **`canWrite` po članku na svakoj strani** — dosljedno sa `insights`, ali za kuratora sa 200 članaka to je 200
  provjera po strani; ako to postane vruće, rješenje je keš scope-a, ne offset paginacija;
- **`sortOrder`/`nameBs` kolizije** rješava `id` kao treći ključ, pa keyset ostaje deterministički i kad
  administrator dva puta unese isti redoslijed i naziv;
- **`limit` iz query stringa je broj, ne DTO** — `resolvePageSize` prima `NaN` i clamp-uje ga na default; nema
  `INVALID_LIMIT` greške jer je „pogrešan limit” uvijek siguran (default), a ne greška koju UI mora hvatati.

## Sljedeći paket

**W7.91 — `BA-knowledge-base-18` (P3):** rješavanje komentara (`resolveKnowledgeComment`) ne ostavlja audit
trag, ne bilježi aktera i ne nosi optimistic state — pa se ne vidi **ko** je označio komentar riješenim ni kad,
a dva paralelna klika se tiho prepisuju.
