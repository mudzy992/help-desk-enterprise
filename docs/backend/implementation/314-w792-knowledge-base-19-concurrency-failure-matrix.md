# W7.92 — `BA-knowledge-base-19`: concurrency/failure matrica je izvršna, ne lista u dokumentu

**Paket:** Val 7, `knowledge-base`, **P3**<br>
**Nalaz:** „Deset suiteova je compile-blocked; nedostaje concurrency/failure E2E matrica”<br>
**Kod:** `backend/scripts/knowledge-test-matrix.json` (novo, 30 redova / 5 kategorija / 9 scenarija),
`backend/scripts/run-knowledge-test-matrix.mjs` (novo — `validateKnowledgeTestMatrix` + CLI sa
`--check-only`), `backend/scripts/run-knowledge-test-matrix.test.mjs` (novo, 8 testova self-testa),
`backend/package.json` (`test:knowledge:matrix`, `test:knowledge:matrix:check`), `.github/workflows/ci.yml`
(docs guard: dvije nove provjere)<br>
**DB migracija:** **ne** — paket ne mijenja šemu ni upite<br>
**CI:** vidi „CI i testni dokaz” (run se upisuje po završetku)

## Nalaz

Nalaz `BA-knowledge-base-19` ima dva dijela, i oba su bila **tačna u trenutku audita**:

1. **Deset od dvanaest suiteova nije ni kompajliralo.** Uzrok nije bio u testovima: nedostajao je
   `generated/prisma/enums`, a `PrismaService` nije imao `knowledgeArticle` ni prateće delegate. Rezultat je
   bio gori od crvenog testa — suite se nije izvršio, pa je „nema padova” izgledalo kao zeleno.
2. **Devet scenarija nije imalo nijedan test** (§12): owner/group/reviewer scope revoke, concurrent
   edit/lifecycle, unbounded corpus, forged intercept resolution, rating race, from-reply idempotency, view
   flush crash, scheduler loss i retention. E2E 34 ih nije pokrivao, a jedini zapis o tome bila je rečenica u
   ovom auditu.

Ključna posljedica drugog dijela nije bila „nema testova” — testovi su u međuvremenu napisani (W7.79–W7.91 su
zatvorili osam nalaza ovog modula, gotovo svaki sa svojim unit i/ili PostgreSQL dokazom). Posljedica je bila da
**niko ne može reći koji test dokazuje koji scenario bez ručnog pretraživanja**, i da ništa ne sprječava da se
taj test preimenuje, preskoči ili izbriše — a audit i dalje tvrdi pokrivenost koju više nema. Isti obrazac se
već jednom dogodio: §12 je do danas nosio snimak „2/12 prolazi, 10/12 compile-blocked” kao da je aktualan.

## Rješenje

**Matrica je fajl koji mašina provjerava, a ne tabela koja stari.**

### `knowledge-test-matrix.json`

Pet kategorija (`concurrency`, `failure`, `scope`, `corpus`, `retention`) i trideset redova; svaki red ima
`scenario` (jedan od devet iz §12), `what` (ljudski opis), `spec` i **`test`** — tačno ime testa u tom specu:

```json
{
  "concurrency": [
    {
      "scenario": "concurrent edit/lifecycle",
      "what": "two editors, one row: the stale write loses",
      "spec": "src/modules/knowledge-base/knowledge-base.concurrency.spec.ts",
      "test": "lets the first of two edits win and rejects the stale one"
    }
  ]
}
```

Ime testa je namjerno dio ugovora. Putanja sama po sebi ne dokazuje ništa: fajl može postojati i ne sadržavati
nijedan test, ili sadržavati drugačiji test od onog koji je nalaz zatvorio.

### `run-knowledge-test-matrix.mjs`

`validateKnowledgeTestMatrix(...)` je čista funkcija (dobija `matrix`, `readSpec`, `specExists`,
`integrationRegistry`, `auditDoc`), a CLI je tanka ljuska oko nje. Guard pada ako:

1. **test ne postoji** — spec fajl nedostaje ili ne sadrži ime testa iz matrice;
2. **test je preskočen** — `it.skip`, `xit`, `xdescribe`, `test.skip` u navedenom specu (zelena oznaka tada
   laže isto kao nekompajlirani suite);
3. **PostgreSQL spec nije registrovan** u `scripts/run-isolated-integration.mjs` — integration spec koji nije
   u registru se kompajlira i onda **nikad ne izvrši** u CI-ju;
4. **scenario iz §12 ostane bez reda**, ili matrica koristi kategoriju/scenario koji nije u §12 listi;
5. **audit 25** ne upućuje na matricu ili ponovo nosi zastarjelu tvrdnju (`2/12 suiteova prošlo`,
   `10/12 compile-blocked`).

Bez `--check-only` skripta izvršava i sve unit specove iz matrice (`npm run test:knowledge:matrix`), pa je
matrica upotrebljiva i kao fokusiran lokalni run; `--check-only` je ono što CI izvršava u **docs guard** poslu
(bez `npm ci`, bez baze, ~0,2 s), jer je to jedini posao koji se izvršava i na docs-only izmjenama.

### Šta je bilo pokriveno, a šta dodato

Matrica nije donijela nove produktne testove jer **nije bilo praznih ćelija**: devet scenarija su do W7.91
zatvorena kao nalazi, svaki sa svojim dokazom. Ono što je dodato je veza scenario → test i mašinska provjera
te veze:

- **scope** — `delegation` (owner-group membership revoked on the next request), `reviewer-delegation`
  (review rights revoked when the assignment is cleared), `authorization` (restricted article hidden from
  agents and foreign OU admins), `intercept-resolution` (forged unit / forged article / unreadable article);
- **concurrency** — `concurrency` spec (first of two edits wins, stale lifecycle refused),
  `placement-atomicity`, `category-archive-race`, `feedback-concurrency` (same voter twice, eight votes at
  once), `from-reply-atomicity`, `view-flush-idempotency` (two flushes on one day),
  `scheduler-reconciliation` (two workers, one schedule), `knowledge-comment-resolution` (W7.91 race);
- **failure** — crash-retry flush, failed draft leaves no orphan, placement rolled back when the change log
  fails, sweep restored after Redis loses the registration, reminder dedupe on the second sweep, delete of a
  published article refused, resolve without write permission changes nothing;
- **corpus** — page walk without gaps/duplicates, scan budget per request, unreadable cursor refused, comment
  feed never skips a resolved row;
- **retention** — archived article redacted across title/body/comments/views/change log/inbox copies, deleted
  article's change-log trail redacted.

**Deset nekada blokiranih suiteova danas prolazi** (authorization, lifecycle, feedback, intercept, list
filters, visibility batch, portal service, portal from-reply, freshness, reminder dedupe): **10 suiteova /
62 testa**. Modul ukupno: **36 suiteova / 203 testa** — 28 unit suiteova (183 testa) prolazi lokalno, 8
PostgreSQL suiteova (20 testova) se lokalno preskače bez baze i izvršava u CI-ju preko
`run-isolated-integration.mjs`. Guard zato ima i `integrationSpecs` provjeru: „preskočeno lokalno” je
prihvatljivo samo ako postoji posao koji ga izvršava.

**Lokalno:** `node backend/scripts/run-knowledge-test-matrix.mjs --check-only` ⇒ `5 kategorija, 9 scenarija,
18 spec fajlova (9 unit, 9 PostgreSQL)`; `node --test backend/scripts/run-knowledge-test-matrix.test.mjs` ⇒
**8/8**; `npx jest src/modules/knowledge-base` ⇒ **28/28 unit suiteova, 183/183 testa** (8 integracionih
preskočeno bez baze).

## Šta nije urađeno i zašto

**E2E (Playwright) nije proširen.** Matrica dokazuje garantције na sloju na kojem se one i ostvaruju:
transakcija, `FOR UPDATE`, compare-and-set, unique constraint, advisory lock, scheduler registration. E2E bi
iste trke ponavljao kroz UI — sporije, nestabilnije i bez mogućnosti da pouzdano izazove npr. gubitak Redis
registracije. E2E 34 (portal/category/article lifecycle, feedback/view, user deny za create) i E2E 22
(accessibility) ostaju pokrivači korisničkih tokova i nisu mijenjani. Ovo je svjesno prihvaćen residual i
zapisan je u §12 audita, a ne prećutan.

## CI i testni dokaz

- **Run:** [CI #45076199484](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45076199484) —
  `success` na `559feb2`. Svi poslovi zeleni: backend build + test, backend PostgreSQL + Redis integracije,
  frontend build + test, backend container + supply chain, **docs guard** (u kojem se sada izvršavaju
  `run-knowledge-test-matrix.mjs --check-only` i njegov self-test) i CI gate.
- **Docs guard je taj koji nosi provjeru:** matrica se validira i na docs-only izmjenama, gdje backend posao
  ne starta — zato guard ne traži `npm ci` ni bazu (čita JSON, spec fajlove, registar integracija i ovaj audit).
- **Lokalno prije runa:** `--check-only` ⇒ `5 kategorija, 9 scenarija, 18 spec fajlova (9 unit, 9 PostgreSQL)`;
  self-test **8/8**; `npx jest src/modules/knowledge-base` ⇒ **28/28 unit suiteova, 183/183 testa** (8
  integracionih preskočeno bez baze); `node scripts/check-backend-findings.mjs` ⇒ 310/386 usklađeno;
  `node scripts/check-docs-content.mjs` ⇒ OK. `npm run test:knowledge:matrix` (bez `--check-only`) izvršava
  unit specove lokalno i traži generisani Prisma klijent — u CI-ju to pokriva `npm test`, pa se u docs guardu
  namjerno izvršava samo `--check-only`.

## Registar nalaza

`BA-knowledge-base-19` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 25](../audits/25-knowledge-base.md#16-tabela-nalaza). Time je `knowledge-base` **19/19** — modul nema
otvorenih nalaza. Zbirovi poslije zatvaranja: **310 zatvoreno / 386 otvoreno / 696**; Val 7 **89 / 22
(0/12/10)**.

## Veze

- [Audit 25 — §12 (matrica) i §37 (closeout)](../audits/25-knowledge-base.md)
- [Registar nalaza](../BACKEND-FINDINGS-REGISTER.md)
- [313 — W7.91, posljednji produktni paket modula](313-w791-knowledge-base-18-comment-resolution-actor.md)
