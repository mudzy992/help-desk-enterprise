# Package closeout — W7.49

**Paket:** W7.49 — owner/owner-group delegacija vezana za OU i service scope<br>
**Nalaz:** `BA-knowledge-base-01` (P1) — **zatvoren**<br>
**Kodni commit:** `c017aa1`<br>
**Finalni testani SHA:** `c017aa1`<br>
**CI:** [`44476675905`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44476675905) — zelen (17m04s)<br>
**DB migracije:** nema (eligibility se računa pri svakom zahtjevu iz postojećih assignmenta)

## Nalaz i acceptance

Audit `25-knowledge-base.md` §3 i §15: `isKnowledgeArticleOwner()` je vraćao `true` na puko podudaranje ID-a.
Direktni vlasnik i **svaki** aktuelni član `ownerGroupId` grupe dobijali su read/write bez ijednog `knowledge.*`
permissiona i bez provjere da su još u OU/service scopeu članka. Posljedice: običan `USER` (globalni assignment)
dodan u owner grupu retroaktivno je dobijao cijeli korpus grupe; premještaj korisnika u drugi OU nije oduzimao
prava; promjena grupe mijenjala je prava bez provjere eligibility.

Acceptance (audit §18.1): delegacija **ne nadživljava** eligibility, scope ni revoke. Uz to: zelen CI gate i
bez migracije bez odobrenja.

Odluka o pristupu: eligibility se **ne** snapshotuje u vlastitu tabelu delegacije, nego se izvodi pri svakom
zahtjevu iz aktuelnih assignmenta i aktuelnog članstva u grupi. To je jedini oblik koji revoke čini efektivnim
na sljedećem zahtjevu (snapshot bi ga odgodio do expiryja) i ne traži migraciju. Cijena je da grant nema
„expiry“ polje — vremenski ograničena delegacija traži novu tabelu i ostaje predmet odluke (vidi §Rollout).

## Implementacija

- **`authorize-knowledge-article.ts`** — novi tip `KnowledgeArticleScope` i nova funkcija
  `isKnowledgeDelegationInScope({ context, scope })`: poziva `decideAuthorizationAccess` sa **praznim**
  `requiredRoles`/`requiredPermissions`, `requireOrganizationalUnitScope: true`, `requireServiceScope: true`.
  Delegate mora imati assignment koji pokriva OU putanju članka i (ako je assignment service-scoped) njegov
  servis. Globalni assignment (`organizationalUnitPath: null`) ne pokriva nijednu OU — to je namjerno ponašanje
  `doesOrganizationalUnitScopeCover`, pa običan `USER` ne prolazi.
- **`isKnowledgeArticleOwner()`** — potpis je promijenjen sa `(article, actorUserId, memberIds)` na objektni
  `{ article, context, ownerGroupMemberUserIds, scope }`; prvi korak je scope provjera, pa tek onda `ownerUserId`
  jednakost ili članstvo u `ownerGroupId`. Van scopea funkcija vraća `false` bez obzira na vlasništvo.
- **`can-read-knowledge-article.ts`** — `KnowledgeArticleAccessScope` je sada alias na `KnowledgeArticleScope`
  (jedan izvor istine, bez cikličnog uvoza), a owner grana prosljeđuje `context` i `scope`. Time read, lista,
  batch visibility, portal i `GET /search` hitovi dijele istu provjeru — nema posebnog „owner“ puta koji bi
  ostao nezaštićen.
- **`assert-knowledge-article-mutation.ts`** — `assertCanWriteKnowledgeArticle()` owner grana koristi istu
  funkciju, pa update, submit-review i oba portal write puta (`placeArticle`, `canWrite`) dijele odluku.
  `assertCanReviewKnowledgeArticle()` je **netaknut** — reviewer delegacija je `BA-knowledge-base-02`.
- **Eligibility / revoke:** deaktiviran ili anonimizovan korisnik nema `AuthorizationContext`
  (`createAuthorizationContext` vraća `null`), pa delegacija prestaje i prije scope provjere; uklanjanje iz
  owner grupe važi na sljedećem zahtjevu (nema keširanja članstva); premještaj u drugi OU ili promjena service
  assignmenta obara scope provjeru.
- **Audit:** promjena vlasnika i reviewera je već u change-log diffu (`toKnowledgeArticleSnapshot` nosi
  `ownerUserId`/`ownerGroupId`/`reviewerUserId`), a dodavanje/uklanjanje člana grupe bilježi `groups` modul
  (`groupMemberAdded`/`groupMemberRemoved`) u istoj transakciji. Zato je i revoke dokaziv bez nove tabele.
- **Nije promijenjeno:** reviewer bypass (P1 `02`), INTERNAL company-wide vidljivost (P2 `05`), owner vidljivost
  `RESTRICTED` članka (ostaje postojeće ponašanje — vlasnik u scopeu vidi svoj članak; klasifikacijska
  politika je `05`), frontend (nema novih polja ni ruta; `403` koristi postojeći `FORBIDDEN` ugovor).

## Direktni testni dokaz

- `knowledge-base.delegation.spec.ts` (6 testova, novo):
  - vlasnik **bez ijednog knowledge permissiona**, ali sa OU/service assignmentom, uspješno piše i njegova
    izmjena je u change-logu sa `actorUserId` vlasnika;
  - vlasnik sa **globalnim** `USER` assignmentom ne može ni pisati ni čitati draft (`FORBIDDEN` u oba slučaja);
  - vlasnik sa **tuđim OU** assignmentom (HR nad IT člankom) ne piše, a lista mu članak ne vraća;
  - vlasnik scopeovan na OU ali na **drugi servis** ne piše (service grana scope provjere);
  - group-owned članak: scopeovan član grupe piše, globalni `USER` u istoj grupi ne piše, a nakon
    `groupMember.deleteMany` i write i read padaju na `FORBIDDEN` (revoke je trenutan);
  - super admin bypass i scoped writer kroz permission ostaju netaknuti.
- `knowledge-base.authorization.spec.ts` — postojeći tok „vlasnik uređuje draft, reviewer odobrava, vlasnik ne
  objavljuje“ prolazi sa scopeovanim vlasnikom; deny slučajevi (USER create, HR agent u IT, confidential,
  restricted) nepromijenjeni.
- `knowledge-base.visibility-batch.spec.ts`, `knowledge-base.list-filters.spec.ts`,
  `portal/knowledge-portal.service.spec.ts`, `portal/knowledge-portal.from-reply.spec.ts`,
  `knowledge-base.intercept.spec.ts` — batch visibility i portal koriste istu funkciju, prolaze bez izmjena.
- Cijeli modul: **13 suiteova / 49 testova** prolazi; `npx eslint "src/modules/knowledge-base/**/*.ts"` čist.

## CI i testni dokaz

CI run [`44476675905`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44476675905) na `c017aa1`
(2026-11-19T07:03:23Z → 07:20:27Z):

- **Backend:** generisani Prisma, wiring manifest, build, lint, safety-net i pun Jest (uključujući novi
  `knowledge-base.delegation.spec.ts`) — uspješno.
- **PostgreSQL/Redis integration:** postojeći `knowledge-base` suiteovi — uspješno.
- **Frontend build + test:** lint, format, testovi, build i bundle budget — uspješno (bez izmjena frontenda).
- **Docs guard / Backend container + supply chain / CI gate:** uspješno.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard` — E2E
  pokreće korisnik.
- **Neuspjeli pokušaji:** nema — prvi run je zelen.

Dodatne lokalne provjere i ograničenja: cijeli backend unit run **883 suitea / 4961 test** prolazi; preostala
dva pada su poznati sandbox artefakti (`announcement-delivery` traži `--experimental-vm-modules`,
`disk-...streaming` ovisi o okruženju) i nisu vezani za ovaj paket. `npx prisma generate` u sandboxu ne može
dohvatiti engine binarni paket, pa je lokalno korišten `src/generated/prisma` stub (gitignored); CI generiše
pravi klijent.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-01` (P1) — `25-knowledge-base.md` red je `zatvoreno`, closeout §19.
- Ostaju otvoreni u `25-knowledge-base.md`: 18 nalaza, **P1: `02`, `03`, `04`**.
- Kontrolni zbir: plan **427 otvoreno / 269 zatvoreno / 696**; Val 7 **63 otvoreno / 48 zatvoreno / 111**
  (P1 6 / P2 40 / P3 17); registar `BACKEND-FINDINGS-REGISTER.md` **437 / 259 / 696**.

## Migracija, rollout i rollback

Nema migracije i nema schema promjene: nema nove tabele delegacije, nema nove kolone — eligibility se izvodi iz
postojećih `UserRole` assignmenta, `GroupMember` redova i `AuthorizationContext`-a. Nema novih ruta ni promjena
DTO-a; `PATCH /knowledge-base/articles/:id` i read rute vraćaju postojeći `FORBIDDEN` (403) kada delegacija ne
važi. Rollout je kompatibilan: nema backfillа, a promjena je fail-closed — vlasnik koji je van scopea **gubi**
pravo pisanja do prvog zahtjeva, što je i cilj nalaza. Operativna posljedica za deployment: provjeriti da
aktuelni vlasnici članaka imaju assignment koji pokriva OU i servis članka (jednokratna provjera; ako neki
vlasnik ostane bez prava, ispravka je dodjela assignmenta ili promjena vlasnika kroz `PATCH`, što je auditirano).
Rollback: revert `c017aa1` — ponašanje se vraća na ID-jednakost, bez uticaja na podatke.

## Sljedeći paket

**W7.50 — `BA-knowledge-base-02` (P1):** reviewer assignment daje read/review bez aktuelnog permission scopea i
bez revoke lifecyclea. Nije započet prije zelenog gatea za ovaj paket.
