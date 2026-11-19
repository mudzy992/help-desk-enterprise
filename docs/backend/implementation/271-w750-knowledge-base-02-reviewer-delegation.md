# Package closeout — W7.50

**Paket:** W7.50 — reviewer delegacija vezana za OU/service scope i revoke<br>
**Nalaz:** `BA-knowledge-base-02` (P1) — **zatvoren**<br>
**Kodni commit:** `b0df096` (logika) + `e71fbf9`/`fcfce5b` (supply-chain gate)<br>
**Finalni testani SHA:** `fcfce5b`<br>
**CI:** [`44485659347`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44485659347) — zelen (14m54s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `25-knowledge-base.md` §3: `isKnowledgeArticleReviewer()` je vraćao `true` na puko podudaranje ID-a, pa je
dodijeljeni reviewer zadržavao read i review i nakon premještaja u drugi OU, nakon promjene service assignmenta i
nakon što mu je pravo ukinuto; `knowledge.article.review` u scopeu članka nije bio potreban. Reviewer je mogao
čitati draft i odobravati objavu bez ijednog permissiona, a jedini „revoke“ bio je ručni reset polja.

Acceptance: delegacija review-a ne smije nadživjeti eligibility, scope ni revoke; scoped `knowledge.article.review`
mora i dalje raditi; zelen CI gate; bez migracije.

## Implementacija

- **`isKnowledgeArticleReviewer()`** — potpis je objektni (`{ article, context, scope }`); prvo se provjerava
  `reviewerUserId === context.subjectId`, a zatim `isKnowledgeDelegationInScope()` (ista funkcija koju vlasništvo
  koristi od W7.49). Van scopea ili bez assignmenta koji pokriva OU putanju i servis članka → `false`.
- **`canReadKnowledgeArticle()`** — reviewer grana prosljeđuje `context` i `scope`, pa read, lista, batch
  visibility, portal i `GET /search` hitovi dijele istu odluku; nema zaobilaznog „reviewer“ puta.
- **`assertCanReviewKnowledgeArticle()`** — ista provjera za `approve`/`reject`; scoped
  `knowledge.article.review` ostaje drugi, nezavisni put (menadžer koji nije dodijeljeni reviewer).
- **Revoke lifecycle:** `reviewerUserId = null` (ili zamjena reviewera, ili njegov premještaj u drugi
  OU/servis) prekida read i review na sljedećem zahtjevu — nema keširanog stanja. Promjena je auditirana u
  change-log diffu članka (`reviewerUserId` je dio `toKnowledgeArticleSnapshot`), a deaktivacija/anonimizacija
  gasi pristup već time što `createAuthorizationContext` vraća `null` za neaktivnog korisnika.
- **Nije promijenjeno:** reviewer se i dalje dodjeljuje kroz `PATCH`/portal (bez nove tabele i bez grant
  snapshotа), `knowledge.article.review` semantika, `submit`/`publish` tokovi i frontend (nema novih polja).
- **Supply-chain gate (nužno za ovaj paket):** pinovani `node:22-alpine` digest zamijenjen je novijim
  (node `22.23.4` → CVE-2026-123864/123865/123866/123872), a `libssl3`/`libcrypto3` su u runtime stageu
  podignuti na zakrpljeni Alpine build (`>= 3.5.9-r1`, CVE-2026-95691/95692/107496/88823). Bez toga bi svaki
  naredni paket padao na `Enforce zero high/critical image vulnerabilities`, nezavisno od koda.

## Direktni testni dokaz

- `knowledge-base.reviewer-delegation.spec.ts` (5 testova, novo): reviewer bez ijednog permissiona, ali sa
  scopeom, čita draft i odobrava objavu; reviewer sa assignmentom u drugom OU ne čita ni ne odobrava; reviewer
  scopeovan na drugi servis ne odobrava; nakon `reviewerUserId = null` approve i read padaju na `FORBIDDEN`;
  scoped `knowledge.article.review` (`adminIt`) i dalje odobrava tuđi članak.
- `knowledge-base.authorization.spec.ts` — vlasnik uređuje, reviewer odobrava, vlasnik ne objavljuje: prolazi sa
  scopeovanim reviewerom (harness).
- Ostatak modula (13 suiteova) prolazi bez izmjena: batch visibility, lista, portal, intercept, feedback,
  lifecycle, from-reply scrub.
- Frontend nije mijenjan; `tsc`, `eslint` i `vitest` na frontendu prolaze u CI-ju.
- `backend/scripts/check-container-contract.mjs` + `check-container-contract.test.mjs` — 5/5 prolazi nakon
  izmjene Dockerfilea (digest ostaje pinovan, `zlib` pin netaknut, non-root/read-only/SIGTERM ugovor očuvan).

## CI i testni dokaz

CI run [`44485659347`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44485659347) na `fcfce5b`
(2026-11-19T08:12:29Z → 08:27:23Z):

- **Backend:** build, lint, safety-net i pun Jest — uspješno.
- **PostgreSQL/Redis integration:** `knowledge-base` suiteovi — uspješno.
- **Frontend build + test:** uspješno.
- **Backend container + supply chain:** `Enforce zero high/critical image vulnerabilities` **uspješno** nakon
  digest bumpa i openssl pina.
- **Docs guard / CI gate:** uspješno.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard`.
- **Neuspjeli pokušaji (dokumentovano, sa uzrokom i korekcijom):**
  1. `44479306205` na `b0df096` — `Backend container + supply chain`: 12 high CVE-a u pinovanom base imageu
     (node 22.23.4 + libssl3/libcrypto3 3.5.9-r0). Isti job je bio zelen 20 minuta prije na nepromijenjenom
     Dockerfileu ⇒ feed se promijenio, nije regresija koda. Rerun (`--failed`) vratio je istu grešku.
  2. `44483987064` na `e71fbf9` (novi digest) — 12 → **8** nalaza: node CVE-ovi riješeni, `libssl3`/`libcrypto3`
     ostali. Korekcija: `fcfce5b` dodaje zakrpljeni openssl u runtime stage.
  3. `44485659347` na `fcfce5b` — **zelen**.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-02` (P1).
- Ostaju otvoreni u `25-knowledge-base.md`: 17 nalaza, **P1: `03`, `04`**.
- Kontrolni zbir: plan **426 otvoreno / 270 zatvoreno / 696**; Val 7 **62 otvoreno / 49 zatvoreno / 111**
  (P1 5 / P2 40 / P3 17); registar `BACKEND-FINDINGS-REGISTER.md` **436 / 260 / 696**.

## Migracija, rollout i rollback

Nema migracije i nema schema promjene — reviewer eligibility se izvodi pri svakom zahtjevu iz postojećih
assignmenta. Nema novih ruta ni DTO promjena; `approve`/`reject` i read rute vraćaju postojeći `FORBIDDEN` kada
delegacija ne važi. Rollout je fail-closed: reviewer koji je van scopea gubi pravo do prvog zahtjeva, pa prije
deploya treba provjeriti da dodijeljeni revieweri imaju assignment koji pokriva OU i servis članka (ispravka je
dodjela assignmenta ili novi reviewer kroz `PATCH`, oboje auditirano). Promjena base imagea zahtijeva ponovni
build i deploy imagea; rollback: revert `fcfce5b`/`e71fbf9` vraća stari digest (gate bi tada ponovo bio crven) —
preporučeni rollback je samo revert logičkog commita `b0df096`, uz zadržan novi base image.

## Sljedeći paket

**W7.51 — `BA-knowledge-base-03` (P1):** article edit/lifecycle nema version/CAS ni review vezan za content
revision. Nije započet prije zelenog gatea za ovaj paket.
