# W7.89 — `BA-knowledge-base-16`: flush pregleda je idempotentan, fallback ne izmišlja posjetioce

**Paket:** Val 7, `knowledge-base`, **P3**<br>
**Nalaz:** „View flush crash može duplirati totals; DB fallback napuhuje unique viewers”<br>
**Kod:** `knowledge-base/portal/knowledge-article-views.ts` (flush piše **apsolutnu** dnevnu vrijednost,
brava nad redom članka (`FOR UPDATE`) unutar transakcije, delta za `KnowledgeArticle.viewCount`, clamp
`uniqueViewers`, odvojen `recordDatabaseView`), `knowledge-base/portal/knowledge-view-flush.service.ts`
(nepromijenjen ugovor), `backend/scripts/run-isolated-integration.mjs` (registracija novog speca); testovi:
novi `knowledge-article-views.spec.ts` (**6**), novi
`portal/knowledge-view-flush-idempotency.integration.spec.ts` (**3**, PostgreSQL + Redis),
`knowledge-portal.service.spec.ts` (fake dobio `findUnique` + apsolutni upsert, nova tvrdnja o fallbacku)<br>
**DB migracija:** nema<br>
**CI:** _upućuje se na `73d2720`_

## Nalaz

Pregledi se broje u Redis-u (dnevni counter + HLL posjetilaca) i flush-uju u `KnowledgeArticleView` svakih
15 minuta. Dvije stvari su bile pogrešne, i obje su tiho kvarile broj koji ljudi koriste za odluke:

1. **Flush je bio događaj, ne stanje.** `upsert` je radio `views: { increment }` i
   `viewCount: { increment }`. Crash između commita i `del`-a Redis ključeva znači da ponovni flush pročita
   iste countere i **doda ih još jednom** — dan se trajno duplira. Auditor je to nazvao „analytics
   tolerancijom”, ali `insights` rangira „najgledanije” upravo preko `_sum.views` po danima (`mostViewed`),
   pa duplikat mijenja rang listu po kojoj se odlučuje šta prepisati. To više nije tolerancija.
2. **Fallback je izmišljao posjetioce.** Kad Redis padne (ili ACL ne da HLL komande), posjeta ide pravo u
   bazu kao `views + 1`, `uniqueViewers + 1`. Bez Redis-a niko ne može reći je li taj korisnik tu bio, pa je
   svaka posjeta tokom incidenta postajala „novi posjetilac” — broj koji raste sa brojem osvježavanja
   stranice. Isti dan je poslije toga mogao dobiti i Redis flush, pa se pogreška samo naslagala.

Zajednički korijen: dnevni red je bio **inkrement** („dodaj ovoliko”), a mora biti **stanje** („ovoliko je
bilo tog dana”). Kad je red stanje, ponovljeni flush je po definiciji bezopasan.

## Rješenje

**Apsolutni dnevni red + delta za total + jedna brava po paru `(article, day)` + fallback koji priznaje šta
ne zna.** Bez migracije: kolone su već postojale, samo su značile „dodaj” umjesto „ovo je dan”.

### Flush: dan je stanje

`writeFlushedDay` u jednoj transakciji:

1. zaključa **red članka** (`SELECT "id" FROM "KnowledgeArticle" WHERE "id" = $1 FOR UPDATE`) — brava je
   vezana za transakciju, pušta se na commit/rollback i pokriva i prvi upis dana (kad nema dnevnog reda da se
   zaključa);
2. pročita prethodni dan (`findUnique`);
3. upiše **apsolutno**: `views = max(previous.views, redisViews)`,
   `uniqueViewers = min(max(previous.uniqueViewers, hll), views)`;
4. `KnowledgeArticle.viewCount` pomjeri **samo za deltu** (`next − previous`) i samo ako je delta > 0.

Posljedice su tačno one koje nalaz traži:

- **crash poslije commita, prije `del`-a**: retry pročita iste countere, izračuna istu apsolutnu vrijednost,
  delta = 0 — ni dnevni red ni total se ne mijenjaju, a ključevi se ipak očiste (dan se ne ponavlja
  zauvijek);
- **ključevi istekli pa ponovo napravljeni manjim** (osmodnevni TTL): `max` znači da dan i total nikad ne
  padaju — izgubljeni pregledi se ne „vraćaju u nazad”;
- **dva flush-a na istom danu**: brava serijalizuje par, drugi vidi commit-ovan dan i piše nulu;
- **`uniqueViewers` ≤ `views`** je invarijanta koju clamp drži i za slučaj HLL-a koji iznenadi.

### Fallback: priznaje šta ne zna

`recordDatabaseView` (Redis-less put) upisuje `views + 1` i **ne dira `uniqueViewers`**; total ide +1. Time
`uniqueViewers` postaje ono što je oduvijek i bio u istini: **donja granica** preko dana koje je Redis
opsluživao. Incident više ne može napraviti „svaki pregled = nova osoba”. Kada Redis proradi prije kraja
dana, flush spojí fallback red sa HLL-om kroz `max` (vidi „Preostali rizik”).

### Ostale posljedice

- **Greške se ne gutaju više slijepo.** Flush je ranije hvatao **svaku** grešku i pravio se da je članak
  obrisan. Sada se guta samo `P2003`/`P2025` (stvarno obrisan članak — njegovi counteri su suvišni), a sve
  ostalo se propagira; W7.86 procesor i dalje pretvara pad flush-a u `logger.warn` bez obaranja posla.
- **`kb_views_flushed` je tačniji**: broji članke čiji se broj **stvarno pomjerio**, pa crash-retry više ne
  izgleda kao „7 članaka flushovano” kad nije upisano ništa.
- **`lastViewedAt`** se pomjera samo kad delta > 0 (i dalje kroz `GREATEST`, pa je idempotentan i sam).

### Zašto ne drugačije

- **Zašto ne „flush token” (idempotency key u bazi)?** Token traži novu tabelu/kolonu (migracija) i drugi
  izvor istine pored dnevnog reda. Apsolutni red je isti garant bez ijedne nove kolone: ponovni upis iste
  vrijednosti nije „dupli upis”, nego isti upis.
- **Zašto ne `INSERT ... ON CONFLICT ... RETURNING` sa deltom u jednom SQL-u?** Delta se mora izračunati iz
  **prethodnog** stanja, a pod `READ COMMITTED` snimkom jedne izjave to stanje ne mora biti ono na koje će
  `ON CONFLICT` naći. Brava je eksplicitna i čitljiva; upis ostaje Prisma `upsert`, pa ga razumiju i
  in-memory test klijenti.
- **Zašto brava nad člankom, a ne nad dnevnim redom?** Dnevni red pri prvom upisu dana ne postoji, a
  `FOR UPDATE` nad praznim skupom ne zaključava ništa — dva prva flush-a bi mogla pročitati nulu. Red članka
  uvijek postoji (bez njega i nema šta da se broji), pa je on prirodna tačka serijalizacije; cijena je da se
  flush-ovi za **isti članak** i različite dane čekaju, što je zanemarljivo za jedan pozadinski posao.
- **Zašto ne savjetodavna brava (`pg_advisory_xact_lock`)?** Radi, ali vraća `void`, koji Prisma drajver ne
  može deserijalizovati; izbjegavanje toga kroz omotače je više trikova nego što vrijedi.
- **Zašto fallback ne piše HLL u bazi?** To bi značilo red po posjetiocu (`KnowledgeArticleView` je agregat,
  a identiteti se namjerno ne čuvaju — vidi audit §8). Cijena bi bila veća od koristi za P3.

### Cijena

- Jedan `SELECT ... FOR UPDATE` i jedan `findUnique` po `(dan, članak)` pri flush-u — zanemarljivo prema upisu;
  flush je jedan repeatable posao, ne hot path.
- Flush sada može vratiti **manje** nego ranije za isti Redis sadržaj (delta 0), što je i cilj.

## Direktni testni dokaz

**`knowledge-article-views.spec.ts` (novo, 6):** crash-retry (isti counteri vraćeni u Redis poslije flush-a)
ne mijenja ni dan ni total, vraća `0` i **ipak** čisti ključeve; dan sa manjim ponovo napravljenim ključevima
nikad ne pada (`9/4` ostaje `9/4`, total `9`); `uniqueViewers` se clamp-uje na `1` kad HLL tvrdi `5`;
brava nad člankom se uzima **prije** `findUnique` i `upsert`-a; `P2003` se guta i dan se čisti, `P2010` se
propagira; dva Redis-less pregleda daju `views: 2, uniqueViewers: 0` i total `2`.

**`knowledge-view-flush-idempotency.integration.spec.ts` (novo, 3, PostgreSQL + Redis):** pravi flush upiše
`5/3` i total `5`, a simulirani crash (dan vraćen u Redis) daje `0`, iste brojeve i očišćen `pendingDays`;
**dva paralelna flush-a** nad istim danom (`Promise.all`) sabiraju tačno jedan upis, dan `7/4`, total `7` —
dokaz da brava drži na stvarnom PostgreSQL-u; dva Redis-less pregleda daju `2/0` i total `2`, a flush koji
zatim vidi HLL `5/2` spaja dan na `5/2` i total na `5`.

**`knowledge-portal.service.spec.ts`:** fake dnevni red sada podržava i apsolutni upis i `findUnique`; test
„counts published views in Redis, flushes finished days and falls back to the database” dodatno tvrdi da
fallback **ne** diže `uniqueViewers` (dan `4/2`, a ne `4/3` kako je staro ponašanje davalo).

**Lokalno:** backend **939 suite / 5.394 testa** (314 skipped: integracije bez baze), `eslint` i `tsc` zeleni
(1.124 preostalih stub-grešava je isti broj kao prije paketa, nijedna u ovim fajlovima).

## CI i testni dokaz

_Status se upisuje poslije zelenog runa na `73d2720`._

## Registar nalaza

`BA-knowledge-base-16` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 25](../audits/25-knowledge-base.md#16-tabela-nalaza). Zbirovi poslije zatvaranja: **307 zatvoreno /
389 otvoreno / 696**; Val 7 **86 / 25 (0/12/13)**, `knowledge-base` **16/19**.

## Migracija, rollout i rollback

Migracije nema, nema promjene API-ja ni frontenda. Rollout je običan deploy: stari Redis sadržaj (counteri i
HLL) ostaje čitljiv, a prvi flush poslije deploya samo upiše apsolutne vrijednosti umjesto inkremenata — za
dane koji su već flushovani prije deploya to znači delta 0, za neraspoređene dane isti rezultat kao ranije.
Rollback je vraćanje fajlova; pogoršanja nema, jer apsolutni upis ne kvari ništa što stari kod čita.

**Preostali rizik (dokumentovan):**

- **HLL je aproksimacija** (~0,8 %, 12 KB): `uniqueViewers` je približan po prirodi, ne po grešci;
- **mješovit dan (dio Redis, dio fallback) uzima `max`**: 10 fallback pregleda + 5 Redis pregleda istog dana
  daje 10, dakle **podbrojava** 5. Nikad ne duplira i nikad ne izmišlja posjetioce — to je izbor (donja
  granica) i tako je zapisan u docblock-u i ovdje;
- **`uniqueViewers` je donja granica preko dana koje je Redis opsluživao**, ne globalan broj ljudi; API i UI ga
  nigdje ne prikazuju (koristi se samo `viewCount` i dnevni `views` za 30-dnevni rang), pa je i to dokumentovano
  ograničenje, ne skrivena tvrdnja;
- **osmodnevni TTL ključeva** ostaje: dan koji flush ne stigne u osam dana gubi se (W7.86 backlog signali su
  rana opomena; `lagDays > 1` je znak da sweep ne radi);
- **brava je po članku**, ne po cijelom flush-u: dva flush-a se i dalje mogu paralelno baviti različitim
  člancima — a za isti članak se čekaju, što je i poželjno (delta se računa iz jednog stanja).

## Sljedeći paket

**W7.90 — `BA-knowledge-base-17` (P3):** `insights` komentari imaju tvrdi limit od 50 bez ikakvog signala
da je nešto odsječeno, a category/list API nema cursor/hasMore — treba `truncated` signal (i po mogućnosti
ključ za dalje) umjesto tihog reza.
