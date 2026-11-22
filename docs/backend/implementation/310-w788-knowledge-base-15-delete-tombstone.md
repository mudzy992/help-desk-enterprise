# W7.88 — `BA-knowledge-base-15`: brisanje članka je tombstone, ne goli `delete()`

**Paket:** Val 7, `knowledge-base`, **P2**<br>
**Nalaz:** „Hard delete kaskadno uklanja feedback/views bez formalne tombstone/retention politike”<br>
**Kod:** `knowledge-base/delete-knowledge-article.ts` (prepisan: kapija + transakcioni tombstone),
`knowledge-base/knowledge-base.error.ts` + `knowledge-base/map-knowledge-base-error.ts`
(`ARTICLE_NOT_RETIRED` ⇒ 409), `audit-log/audit-log.constants.ts` (`knowledge.article.deleted`),
`audit-log/audit-action-schema-registry.ts` (allowlist bez `title`/`body`),
`audit-log/audit-action-compatibility-registry.ts` (entity `knowledge_article`),
`privacy/retention/knowledge-content-retention.executor.ts` (orphan change-log replike, W7.87 + W7.88),
`backend/scripts/run-isolated-integration.mjs` (registracija novog speca); testovi: novi
`delete-knowledge-article.spec.ts` (**9**), novi `knowledge-delete-tombstone.integration.spec.ts` (**3**,
PostgreSQL), `knowledge-content-retention.executor.spec.ts` **5 → 7**, `retention.integration.spec.ts` +**1**;
frontend: `knowledge-article-delete-panel.tsx` (opis posljedica), `knowledge-article-detail-panel.tsx`
(panel samo za penzionisan članak, inače uputa), `map-knowledge-article-error.ts` (`errorNotRetired`),
`lib/audit/audit-log-actions.ts` (`knowledge.article.deleted`), bs/en i18n (+3 ključa +1 audit labela)<br>
**DB migracija:** nema<br>
**CI:** _upućuje se na `2fd516b`_

## Nalaz

`DELETE /knowledge-base/articles/:id` je bio `SUPER_ADMIN`-only i „auditiran” — ali audit je bio **change-log
zapis** sa snapshotom, a ne revizorski događaj, i nije postojao nikakav zapis koji preživi red. Konkretno:

1. **Kapija nije postojala.** Mogao se obrisati `PUBLISHED` članak — dakle stranica na koju vode bookmarki,
   deep linkovi iz notifikacija i `sourceTicketId` referenca — bez ijednog koraka koji se može poništiti.
   Arhiviranje (koje je reverzibilno i auditirano) nije bilo uslov.
2. **Kaskada je brisala dokaze.** `KnowledgeFeedback` i `KnowledgeArticleView` su `Cascade`, pa je brisanjem
   reda nestala i cijela istorija ocjena i pregleda. Brojevi (`ratingCount`, `ratingSum`, `viewCount`) su
   postojali samo u change-log snapshotu.
3. **Change-log snapshot je bio izvan retentiona.** W7.87 retention bira članke (`status ARCHIVED`,
   `archivedAt < cutoff`) i redaktuje njihove change-log redove po `entityId`; kad članak više ne postoji, taj
   red **nikad** ne uđe u selekciju — pa je naslov obrisanog članka (a naslov može nositi ime osobe) ostajao
   trajno, dok je politika za arhivirane članke već reklamirala redakciju. Isti prozor je ostavljao i tijelo
   notifikacije koja je kopirala članak.
4. **Nije bilo revizorskog traga.** Ko je obrisao, kada, šta je red sadržavao po brojevima — ništa od toga
   nije bilo u hash-verificiranoj revizorskoj niti; change log je domenski dnevnik, ne revizija.

Nalaz je P2: brisanje je rijetka, ali nepovratna radnja nad sadržajem koji je bio javan, a jedini trag je bio
red koji retention po definiciji ne može doseći.

## Rješenje

**Kapija za penzionisane članke + transakcioni tombstone bez sadržaja + retention koji doseže replike.**

### Kapija: samo penzionisan članak

`assertDeletable` propušta **`ARCHIVED`** ili članak koji **nikad nije objavljen** (`publishedAt === null`).
Sve ostalo vraća `ARTICLE_NOT_RETIRED` (409, `ConflictException`). Dvije nijanse su namjerne:

- `DRAFT` **nije** automatski „nikad objavljen”: uređivanje sadržaja objavljenog članka ga vraća u `DRAFT`, pa
  takav red nosi feedback i preglede iz svog objavljenog života — zato odlučuje `publishedAt`, ne `status`;
- `IN_REVIEW` se odbija i kad nema `publishedAt`: recenzija je u toku, a brisanje bi je tiho prekinulo.

Arhiviranje je korak koji operator mora svjesno napraviti: ono je reverzibilno, prolazi kroz postojeći
lifecycle audit i — najvažnije — ostavlja URL živim dok ljudi još dolaze na njega.

### Tombstone: sve u jednoj transakciji

`deleteKnowledgeArticle` poslije kapije otvara **jednu** transakciju:

1. pročita brojeve koje kaskada sprema da uništi (`knowledgeFeedback.count`, `knowledgeArticleView.count`);
2. upiše change-log zapis (`delete`, snapshot sa naslovom) — operatorov trag;
3. upiše **revizorski** zapis `knowledge.article.deleted` (`entityType: knowledge_article`,
   `entityId: <articleId>`) sa metapodacima: `slug`, `status`, `classification`, `serviceId`,
   `organizationalUnitId`, `ownerUserId`, `reviewerUserId`, `feedbackCount`, `viewDays`, `viewCount`,
   `ratingCount`, `ratingSum`, `reason`, `deletedAt`. Allowlist u `audit-action-schema-registry` **namjerno
   nema** `title` i `body`: sadržaj ne smije nadživjeti red koji ga je opisivao;
4. isprazni tijela notifikacija koje pokazuju na članak (`payload.articleId`) — one vode na stranicu koje
   više nema;
5. obriše red (feedback i dnevni pregledi kaskadiraju; `Problem.knowledgeArticleId`,
   `PlaybookStep.knowledgeArticleId` i `KnowledgeInterceptResolution.primaryArticleId` su `SetNull`).

Redoslijed nije kozmetika: revizorski zapis se piše **prije** `delete`, pa neuspješan `appendAuditLog`
(neregistrovan ključ, pokvaren lanac) obara cijelu transakciju i članak **ostaje** — nikad obrnut slučaj, da
red nestane bez traga. Zapis ide kroz `recordAuditEntry` sa transaction klijentom, pa se commit-uje sa
brisanjem ili nikako.

### Retention: replike obrisanog članka

`knowledgeContent` executor sada, u istom batchu, redaktuje i `knowledge_article` change-log redove **čiji
članak više ne postoji** (`NOT EXISTS`), uz iste uslove (`createdAt < cutoff`, `reason != marker`). Jedan
bounded upit (`LIMIT 100`, `ORDER BY createdAt, id`) i jedan `updateMany`; ref je `deleted:{articleId}` jer
sluga više nema. `preview` broji i te redove (operatorov broj je broj koji run mijenja) i uključuje njihov
`createdAt` u vremenski prozor; `done` zahtijeva da **oba** pola budu ispod capa. Batch koji nosi samo
replike ne izdaje prazne upite nad člancima (`ids.length > 0` gard).

Time naslov obrisanog članka živi tačno onoliko koliko i naslov arhiviranog: `knowledgeContentDays` (minimum
180) od zapisa, a ne zauvijek.

### Zašto ne drugačije

- **Zašto ne soft delete (`deletedAt` kolona) ili tombstone tabela?** Oboje traži migraciju, a tombstone
  tabela bi trebala i sopstveni unique na `slug` da rezerviše adresu. Revizorski zapis + change-log snapshot
  već nose trag (ko, kada, šta je bilo po brojevima), pa je migracija odgođena svjesno — vidi „Preostali
  rizik”.
- **Zašto ne brisati change-log snapshot odmah pri brisanju?** On je jedini opis **šta** je obrisano; bez
  njega revizor vidi brojeve bez konteksta. Sadržaj ostaje do isteka retentiona, pa ga retention sklanja —
  politika je „sadržaj živi jedan period”, ne „nula”.
- **Zašto ne zabraniti brisanje sasvim?** Arhiviranje pokriva 99% slučajeva, ali greška u unosu i pogrešno
  kreiran članak moraju imati izlaz; `SUPER_ADMIN` + kapija + tombstone je dovoljna kontrola.
- **Zašto ne brisati notifikacije umjesto praznjenja tijela?** Notifikacija je korisnikov zapis („pregledaj
  članak”); brisanje bi mu mijenjalo istoriju, a tijelo je jedini dio koji je kopirao sadržaj.
- **Zašto ne `auditLog.deleteMany` u retentionu?** Revizorska nit je dokaz; retention redaktuje **sadržaj**,
  a revizorski metapodaci su već bez sadržaja.

### Cijena

- Jedna transakcija sa dva `count`-a, dva upisa (change log, audit) i jednim `deleteMany`-jem više nego prije;
  brisanje je rijetko, pa je cijena neprimjetna.
- Retention batch radi jedan raw upit više (po `preview` i po `executeBatch`); `NOT EXISTS` ide preko
  `ChangeLog(entityType, createdAt)` indeksa i PK-a `KnowledgeArticle`.
- Novi revizorski događaj ulazi u allowlist/kompatibilnost registre i u frontend listu akcija — bez toga bi
  `prepareAuditEntry` odbio zapis i brisanje bi padalo (upravo zato test „rolls the delete back when the audit
  chain refuses the entry”).

## Direktni testni dokaz

**`delete-knowledge-article.spec.ts` (novo, 9):** `PUBLISHED` i `IN_REVIEW` se odbijaju bez ijednog upisa;
`DRAFT` sa `publishedAt` se odbija (bio je objavljen), `DRAFT` bez `publishedAt` se briše; arhivirani članak
ostavlja revizorski zapis sa tačno očekivanim metapodacima (`feedbackCount: 4`, `viewDays: 2`, `viewCount`,
`ratingCount`, `ratingSum`) i **bez** `title`/`body`; notifikacije dobijaju `body: null` uz zadržan pointer;
red se briše; prazan razlog pada prije transakcije; pad revizorskog upisa **ne** briše red; nepostojeći
članak je `NOT_FOUND`, ne politika.

**`knowledge-delete-tombstone.integration.spec.ts` (novo, 3, PostgreSQL):** servis odbija objavljen članak sa
`409` i stanje ostaje netaknuto (red, feedback, nula revizorskih zapisa); poslije arhiviranja brisanje
uklanja red, feedback i dnevne preglede, change-log snapshot sadrži naslov, revizorski zapis sadrži brojeve i
ne sadrži ime, kopija notifikacije ima `body: null` i `payload.articleId`, a drugi poziv vraća `404`; nikad
objavljen nacrt se briše i njegov zapis nosi `status: DRAFT`, `feedbackCount: 0`, `viewDays: 0`.

**`retention.integration.spec.ts` (+1):** change-log red obrisanog članka (`entityId` bez reda, `createdAt`
400 dana ranije) se redaktuje (`reason` marker, `diff { redacted }`), a red **živog** `PUBLISHED` članka sa
istim datumom ostaje — dokaz da `NOT EXISTS` ne gazi istoriju postojećih članaka.

**`knowledge-content-retention.executor.spec.ts` (5 → 7):** preview sabira članke i replike i proteže
vremenski prozor na `createdAt` replika; `updateMany` nosi `reason != marker`; refovi su
`deleted:{articleId}` (dedupirani); batch od 100 replika vraća `done: false`; batch sa samo replikama ne
izdaje prazne upite nad člancima.

**Lokalno:** backend unit set **938 suite / 5.388 testova** (311 skipped, integracije bez baze), frontend
**473 fajla / 1.888 testova**, `i18n:check` 9.292 ključa, `eslint` i `tsc` zeleni.

## CI i testni dokaz

_Status se upisuje poslije zelenog runa na `2fd516b`._

## Registar nalaza

`BA-knowledge-base-15` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 25](../audits/25-knowledge-base.md#14-tabela-nalaza). Zbirovi poslije zatvaranja: **306 zatvoreno /
390 otvoreno / 696**; Val 7 **85 / 26 (0/12/14)**, `knowledge-base` **15/19**.

## Migracija, rollout i rollback

Migracije nema; nema ni promjene API ugovora (isti `DELETE`, isti `204`), samo novi kod greške `409` i novi
revizorski događaj. Rollback je vraćanje fajlova: već obrisani članci ostaju obrisani, ali njihov change-log
red ostaje i dalje redaktovan retentionom. Frontend ne nudi dugme za članak koji kapija odbija, pa 409 vide
samo direktni API pozivaoci.

**Preostali rizik (dokumentovan):**

- **slug se može ponovo iskoristiti.** Bez tombstone tabele slug obrisanog članka nije rezervisan, pa novi
  članak može zauzeti isti slug i preuzeti stare linkove; trag u reviziji i change logu ostaje, ali adresa
  nije „zaključana”. Rješenje (unique tombstone red) traži migraciju i svjesno je odgođeno;
- **revizorski metapodaci nose `slug`**, a slug je izveden iz naslova i može sadržati ime. To je cijena
  operatorove pretrage; `redactAuditForSubject` pokriva zapise vezane za subjekta, a ovaj zapis je vezan za
  članak i aktera;
- **brisanje ostaje `SUPER_ADMIN`-only** — nema delegacije na vlasnika/pregledaoca i to je namjerno;
- **drugi domeni gube referencu** (`Problem`, `PlaybookStep`, `KnowledgeInterceptResolution` ⇒ `SetNull`);
  to je postojeće ponašanje i sada je vidljivo u reviziji;
- **promet na starom linku** poslije brisanja je `404`, ne `410 Gone`; preusmjerenje bi tražilo tombstone
  zapis po slugu.

## Sljedeći paket

**W7.89 — `BA-knowledge-base-16` (P3):** view flush poslije pada između DB commita i Redis deletea može
duplirati totals, a DB fallback (bez Redis-a) svaku posjetu broji kao unique viewera — treba idempotentan
absolute daily upsert (flush token) i odvojen fallback brojač.
