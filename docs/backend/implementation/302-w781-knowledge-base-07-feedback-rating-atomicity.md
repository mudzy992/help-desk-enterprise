# W7.81 — `BA-knowledge-base-07`: ocjene se zbrajaju u jednoj transakciji i popravljaju nakon kaskade

**Paket:** Val 7, `knowledge-base`, **P2**<br>
**Nalaz:** „Feedback write + aggregate refresh nije atomski i counter može zastarjeti”<br>
**Kod:** `backend/src/modules/knowledge-base/knowledge-feedback-rating.ts` (novo),
`submit-knowledge-feedback.ts` (transakcija + lock), `users/delete-user.ts` (popravka nakon kaskade),
`create-in-memory-knowledge-feedback-delegate.ts` (filter `rating: { not: null }`),
`knowledge-base.feedback-rating.spec.ts` (novo), `knowledge-feedback-concurrency.integration.spec.ts` (novo),
`users/delete-user.spec.ts` (+1 test), `scripts/run-isolated-integration{,.test}.mjs` (shard + guard)<br>
**DB migracija:** nema<br>
**CI:** [`44939932522`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44939932522)

## Nalaz

`KnowledgeArticle.ratingCount` i `ratingSum` su **keširani agregat** redova `KnowledgeFeedback` — portal ih
koristi za prosječnu ocjenu i za Bayesian bonus u rankingu, bez joina. Taj keš nije bio održavan kao keš:

1. **Dva pisca, dva koraka.** `submitKnowledgeFeedback` je prvo pisao glas, pa **odvojeno** čitao agregat i
   **odvojeno** upisivao apsolutne brojeve (`SET ratingCount = 2`). Dva glasa koja stignu zajedno mogu se
   završiti u pogrešnom redu: T1 pročita 2, T2 pročita 3, T2 upiše 3, T1 upiše 2 — na redu ostane **stariji**
   snapshot, a glasova u bazi ima tri. Portal onda prikazuje prosjek koji ne odgovara nijednom stvarnom skupu.
2. **Redovi koji odu bez pisca.** `KnowledgeFeedback.userId` je `onDelete: Cascade`, pa brisanje korisnika tiho
   uklanja njegove glasove — a **niko** ne preračuna članke koje je ocijenio. Brojevi ostaju naduvani dok se ne
   desi sljedeći glas na tom članku (a i tada se, zbog problema 1, moglo upisati nešto treće).

Posljedica nije „kozmetika”: prosječna ocjena je javna na portalu, a `rankKnowledgeArticles` je koristi za
redoslijed sugestija uz tiket — pogrešan zbir mijenja šta korisnik vidi prvo.

## Rješenje

**Jedan pisac po članku + preračun iz redova, u istoj transakciji.**

- `lockKnowledgeArticleRating(client, articleId)` uzima **row lock** članka (`SELECT … FOR UPDATE`) unutar
  transakcije koja okružuje glasovanje. Time se svi glasovi **istog** članka serijalizuju, a glasovi na drugim
  člancima nisu blokirani (brava je po redu, ne po tabeli).
- `reconcileKnowledgeArticleRating(client, articleId)` **preračuna** `count`/`sum` iz glasova i upiše ih
  apsolutno — egzaktno i idempotentno. Pošto se izvršava pod bravom i u istoj transakciji, nema izgubljenog
  ažuriranja; pošto računa **iz redova**, glas ujedno **popravlja** stari drift umjesto da ga sabere.
- Upis brojeva i dalje ide **sirovim SQL-om** (`UPDATE … SET "ratingCount" = $1`), pa ocjena ne mijenja
  `updatedAt` i ne pretvara se u „izmjenu” koja preuređuje liste — to je bio razlog zašto je
  `updateKnowledgeArticleCounters` uopšte nastao.
- `submitKnowledgeFeedback` sada radi `$transaction(lock → upsert/create → reconcile)`. Thumbs-only glas
  **preskače** preračun jer nikad nije ušao u `ratingCount`/`ratingSum` — hot path (intercept uz tiket) ostaje
  bez dodatnog posla.
- `reconcileKnowledgeArticleRatings(client, ids)` radi isto za **više** članaka (deduplikovan skup), a
  `collectRatedArticleIdsOfUser(client, userId)` vraća tačno one članke čije brojeve korisnik mijenja:
  `distinct articleId` nad glasovima **sa ocjenom** (thumbs-only glasovi ne diraju zbir).
- `deleteUser` sada, **unutar transakcije brisanja**: prikupi članke → `user.delete` (kaskada odnosi glasove) →
  preračun. Uklanjanje i popravka se commit-uju zajedno ili nikako — nema prozora u kojem su brojevi pogrešni.

### Zašto ne „transactional delta” (audit je nudio i to)

Delta (`ratingCount + Δ`) je O(1) i bila bi tačna za buduće glasove, ali **ne popravlja** postojeći drift
(brojevi su već mogli odlutati) i ne rješava kaskadu bez posebnog preračunavanja. Preračun pod bravom je iste
složenosti po redu (agregat nad indeksiranim `articleId`, tipično nekoliko desetina glasova) i uz to je
**samoiscjeljujući**: svaki novi glas vraća članak na tačno stanje. Trigger bi rješio oboje, ali traži
**migraciju** — a migracija bez izričitog odobrenja nije dozvoljena; odluka je dokumentovana kao moguća
buduća optimizacija, ne kao dug.

### Cijena

Po glasovanju: jedan `SELECT … FOR UPDATE` (primarni ključ), jedan upsert, jedan agregat i jedan `UPDATE`.
Brava drži red članka dok transakcija traje — mikrosekunde; glasovi na isti članak se serijalizuju, što je i
svrha. Brisanje korisnika plaća jedan `distinct` upit + po jedan preračun za svaki ocijenjeni članak (tipično
0–3).

## Direktni testni dokaz

**Unit (`knowledge-base.feedback-rating.spec.ts`, 8 testova):**

- jedna ocjena ulazi **jednom** (5, pa promjena na 2 → `1 / 2`, ne `2 / 7`);
- dvije ocjene različitih korisnika → `2 / 6`;
- thumbs-only glas ne dira brojeve (`1 / 3` ostaje);
- **samoiscjeljenje**: članak sa lažnim `9 / 41` + jedan glas 5 → `1 / 5`;
- preračun se izvršava **unutar** transakcije glasovanja (spy nad `$transaction` i `aggregate`);
- `collectRatedArticleIdsOfUser` vraća samo ocijenjene članke (thumbs glas se preskače);
- `reconcileKnowledgeArticleRatings` preračuna svaki distinct članak **tačno jednom** (duplikati i prazni ID-evi
  se skupljaju);
- jedan glas po korisniku ostaje ugovor baze i kad postavka tvrdi drugačije (vidi rizik).

**PostgreSQL integracija (`knowledge-feedback-concurrency.integration.spec.ts`, 4 testa, novi CI shard):**

- **osam istovremenih glasova** → `count = 8`, `sum = 32` egzaktno (dokaz da brava i preračun drže pod
  stvarnim paralelizmom);
- **dva istovremena glasovanja istog korisnika** → jedan red, a brojevi odgovaraju **stvarnom** redu u bazi;
- **korisnik odnese svoje glasove** (transakcija: `user.delete` + `reconcileKnowledgeArticleRatings`, iste dvije
  naredbe koje `deleteUser` sada izvršava tim redom) → brojevi padnu tačno na preostale glasove;
- **stari drift se popravlja** sljedećim glasom (`99 / 999` → tačan zbir);

**Ostalo:** `users/delete-user.spec.ts` +1 test (redoslijed: prikupljanje → brisanje → preračun po distinct
članku, sa `invocationCallOrder` dokazom da preračun ide **poslije** brisanja); runner guard
`node --test scripts/run-isolated-integration.test.mjs` **23/23** (novi test: svaki `knowledge-base`
`*.integration.spec.ts` mora biti u runner listi). Moduli: `knowledge-base` **23 suite/124 testa** (22/120 bez
realne baze + 1/4 integracija), `users` **22/87**, `reports` **31/159** (delegat sa novim filterom), `teams`
nepromijenjen; `eslint` zelen.

## CI i testni dokaz

CI run [`44939932522`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44939932522) na `16a8fcf` je
**success**:

- **Backend build + test:** uspješno (`prisma validate`, `db:generate`, `check:prisma-generated`, `wiring`,
  `build`, `lint`, `test:safety-net:compile`, `test:wiring`, `test:sla:matrix`, puni `npm test`).
- **Backend PostgreSQL + Redis integration:** uspješno, uključujući korak **„Run real PostgreSQL integration
  suites”** — novi `knowledge-feedback-concurrency` shard je registrovan (guard to traži) i izvršen pod stvarnom
  bazom, pa nije „tiho preskočen”.
- **Frontend build + test:** uspješno (frontend nije mijenjan).
- **Backend container + supply chain**, **Docs guard**, **CI gate:** uspješno.
- **Skipped (po konfiguraciji):** `Read-only service-form pattern inventory`, `E2E critical flows`,
  `E2E install wizard` — puni E2E pokreće korisnik.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-07` (P2). Modul je time **8/19** (`01`–`07`, `11`).
- Ostaju otvoreni u `25-knowledge-base.md`: 11 nalaza, **P1: nema** (`08`–`10`, `12`–`15` P2; `16`–`19` P3).
- Globalno nakon regenerisanih zbira: **696 nalaza, 299 zatvoreno / 397 otvoreno**; Val 7 **78/111**, otvoreno
  **33** (P1 0 / P2 19 / P3 14).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Rollback: revert `16a8fcf` vraća neatom­sko osvježavanje i gubi popravku
kaskade; nema podataka za vraćanje.

**Preostali rizik (dokumentovan):**

1. **`@@unique([articleId, userId])` protiv postavke „svaki glas se broji”.** Postavka
   `private.knowledgeBase.feedback.oneVotePerUserPerArticle` tvrdi da isključena pušta **svaki** glas, ali
   jedinstveni indeks dozvoljava jedan red po korisniku i članku — drugi glas završava kao `P2002`
   (`FEEDBACK_DUPLICATE` u testnom dublu). Ispravka traži **migraciju** (uklanjanje jedinstvenog indeksa ili
   uvođenje `vote` ključa), pa je ovdje **zabilježena, ne mijenjana**; ponašanje je pinovano testom.
2. **Historijski drift** na člancima koji više ne dobijaju glasove ostaje do prvog novog glasa (preračun je
   „na glas”, ne globalni sweep). Globalni reconciler je prirodno mjesto u `BA-knowledge-base-13` (scheduler
   reconciliation) i tražio bi svoj paket.
3. **Brava je po članku, ne po korisniku** — namjerno: sprečava izgubljeno ažuriranje zbira, a ne serijalizuje
   cijeli modul.

## Sljedeći paket

**W7.82 — `BA-knowledge-base-08` (P2).**
