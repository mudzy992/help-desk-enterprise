# Package closeout — W7.27

**Paket:** W7.27 — KB article draft i njegov conditional link kao jedna transakcija<br>
**Nalaz:** `BA-problems-09` (P2) — zatvoren<br>
**Kodni commit:** `e6dc139`<br>
**Finalni testani SHA:** `e6dc139`<br>
**CI:** run [`44103735795`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44103735795) — **success**<br>
**DB migracije:** nema (odluka `single_transaction`, bez nove kolone i bez `KnowledgeArticle.sourceProblemId`)

## Nalaz i acceptance

Audit [23-problems.md](../audits/23-problems.md) §5: `POST /problems/:id/knowledge-article` je bio dvije komande.
`ProblemResolutionService.createArticle` je prvo pozvao `createKnowledgeArticle`, koji je u **svojoj** transakciji
upisao `KnowledgeArticle` (`DRAFT`) i change-log red, a tek onda otvorio drugu transakciju sa conditional
`problem.updateMany({ where: { id, knowledgeArticleId: null } })`. Ako dva agenta krenu istovremeno, oba drafta
nastanu, samo jedan link prođe, a gubitnik dobije `PROBLEM_ARTICLE_EXISTS` i njegov draft ostaje nepovezan. Isti
orphan nastaje na svakom padu linka, problem eventa ili audita poslije kreiranja članka, jer prva transakcija već je
commit-ovana.

Acceptance je zatvoren kroz tri odluke vlasnika (2026-11-17, `ask_user`):

1. **`single_transaction`** — članak, njegov change-log red, conditional link, `ProblemEvent` `knowledgeArticle` i
   audit su **jedna** transakcija. Nije odabrana nova kolona/unique relacija (npr. `KnowledgeArticle.sourceProblemId`)
   niti nova migracija; problem ostaje jedina strana koja nosi link (`Problem.knowledgeArticleId`).
2. **`retry = replay`** — retry ili dvostruki klik na već povezan problem **replaya** postojeći članak sa **200**, a ne
   409. Kod `PROBLEM_ARTICLE_EXISTS` ostaje samo za `GET …/knowledge-article/draft` (tamo je 409 i dalje tačan
   odgovor jer draft nema šta vratiti) i za teorijski slučaj da link pokazuje na nepostojeći članak.
3. **`legacy_orphans = none`** — postojeći orphan draftovi se **ne** čiste: nema sweepa, nema reporta, nema
   reconciliation skripte. Odluka je dokumentovana ovdje da se ne bi ponovo otvarala kao „zaboravljen“ posao.

Ne mijenja se W7.26 idempotencija create-a problema, W7.23 delegacija, W7.24 group rješavanje ni W7.25 target
podsjetnici. Publishing članka i dalje ide kroz redovan knowledge-base workflow (draft ostaje `DRAFT`).

## Implementacija

- **`createKnowledgeArticle` prima opcionu transakciju:** peti parametar `options.transaction`
  (`Prisma.TransactionClient`) zamjenjuje read/write klijenta; kad je proslijeđen, funkcija **ne** otvara ugniježđenu
  `$transaction` nego svoje upise (article `create` + `recordKnowledgeArticleChange`) izvršava na pozivaočevom
  klijentu. Bez tog parametra ponašanje je nepromijenjeno (jedna vlastita transakcija), pa knowledge-base i portal
  „article from reply“ tokovi rade kao i do sada.
- **Provjere ostaju prije writea:** `loadKnowledgeActorContext`, `assertKnowledgeServiceExists`,
  `assertKnowledgeOrganizationalUnitExists`, ownership, user/group/reviewer reference, `assertKnowledgeCategoryAssignable`,
  `loadKnowledgeArticleScope`, `assertCanCreateKnowledgeArticle` i alokacija slug-a izvršavaju se i dalje prije
  `create`, sada nad istim klijentom koji će pisati.
- **Jedna transakcija u `ProblemResolutionService.createArticle`:** unutar `$transaction` se ponovo čitaju dvije
  invarijante koje konkurentni writer može promijeniti između optimistične provjere i upisa — status
  (`KNOWN_ERROR`/`RESOLVED`) i `knowledgeArticleId`. Zatim: draft + change-log (kroz pozivaočev klijent), conditional
  `updateMany where knowledgeArticleId: null`, `ProblemEvent knowledgeArticle` i `recordAuditEntry`. Nijedan korak
  nije izvan transakcije, pa pad bilo kojeg od njih poništava i članak.
- **Race i retry:** conditional update je i dalje fence (samo jedan link ikad). Kad fence vrati `count = 0`, kad
  transakcijski re-read nađe postojeći link ili kad optimistična provjera već nađe link, servis poziva
  `existingArticle` (`loadForArticle` sa `allowExisting`) i vraća povezani članak. Draft i event gubitnika nestaju s
  njegovom transakcijom, pa u knowledge baseu ne ostaje ništa osim pobjednikovog članka.
- **HTTP ugovor:** `POST /problems/:id/knowledge-article` sada je `@HttpCode(200)` i za svježi create i za replay —
  klijent ne može razlikovati ishod, a ponovljeni submit je uspjeh, ne konflikt. `GET …/draft` nepromijenjen.
- **Frontend:** `problem-article-sheet` prikazuje grešku submita i dalje inline (`role="alert"`) **i** kao danger
  toast; replay (200 sa postojećim člankom) prolazi kroz isti success put (`onCreated` + zatvaranje sheeta), bez
  posebnog grananja.
- **Nije u scopeu:** cleanup legacy orphan draftova (odluka `none`), orphan report, KB lifecycle/publishing,
  service/incident link scope (`BA-problems-11`), audit pokrivenost claim/update (`BA-problems-12`) i E2E matrica
  (`BA-problems-19`). `GET …/draft` i dalje vraća 409 za već povezan problem.

## Direktni testni dokaz

- `backend/src/modules/problems/problem-resolution.service.spec.ts` (+5 testova, fake `$transaction` sa rollback
  semantikom): draft se kreira **unutar** pozivaočeve transakcije (`createKnowledgeArticle` dobija transakcijski
  klijent i `{ transaction }`, a redoslijed poziva je poslije otvaranja transakcije); pad linka poništava draft,
  event i audit (`knowledgeArticleId` ostaje `null`, `events` prazni, audit nije pozvan); već povezan problem
  replaya postojeći članak bez transakcije i bez novog drafta; gubitnik trke (fence `count = 0`) replaya pobjednikov
  članak, a njegov draft/event se odbacuju; transakcijski re-read koji nađe link ili promijenjen status ne pravi
  draft i vraća replay odnosno `PROBLEM_STATUS_TRANSITION`.
- `backend/src/modules/problems/problems.controller.spec.ts` i ostali `problems`/`knowledge-base`/`portal`/`tickets`
  suiteovi prolaze nepromijenjeni kroz refaktorisani `createKnowledgeArticle` (157 suiteova / 917 testova lokalno).
- `frontend/src/components/problems/problem-article-sheet.spec.tsx` (novo, 3 testa): create šalje tačan payload i
  prijavljuje primljeni članak; replay (200) je uspjeh bez `role="alert"`; pad prikazuje inline
  `problems.errors.articleInvalid` **i** danger toast, sheet ostaje otvoren i `onCreated` se ne poziva.
- Lokalno: `modules/problems|knowledge-base|portal|tickets` — 157 suiteova / 917 testova prošlo (17 suiteova
  skipped jer traže bazu); `problems` frontend 15 testova.

## CI i testni dokaz

CI run [`44103735795`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44103735795) na `e6dc139`
(2026-11-17 UTC):

- **Detect changes:** success.
- **Backend:** generisani Prisma artefakti, `audit:traceability`, `wiring:check` (99 controllera / 626 ruta),
  `prisma validate`, build s anotiranim dijagnostikama, ESLint i full Jest — success.
- **Backend PostgreSQL + Redis integration:** success bez novog suitea; paket ne mijenja schemu, pa release
  migrator, role/privilege provjere i worker recovery rade nad istom bazom (117 migracija).
- **Frontend:** lint, Prettier format check, i18n/hooks/a11y guardovi, `vitest` (uključujući novi sheet spec), build
  i bundle budgeti — success.
- **Docs guard / container + supply chain / CI gate:** success.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows` i `E2E install wizard` — push
  workflow ih ne pokreće (dispatch/schedule only). Nisu „passed“; ciljani E2E nije pokretan za ovaj paket.
- **Neuspjeli pokušaji:** nije bilo nijednog neuspjelog CI runa za ovaj paket; nije bilo ispravki poslije pusha.

## Registar nalaza

- Zatvoreni: `BA-problems-09` (P2) — draft članka i njegov link više nisu dvije komande; gubitnik trke ili pad
  linka/eventa/audita ne ostavlja orphan članak, a retry replaya postojeći članak sa 200.
- Ostaju otvoreni u audit 23: `BA-problems-10`–`BA-problems-19`.
- Kontrolni zbir: **444 otvorenih / 250 zatvorenih / 694 ukupno** (P1 174); globalni registar **454 / 240**; Val 7
  **29 / 109** (80 otvorenih: 13 P1 / 47 P2 / 20 P3); `problems` **9/19** (10 otvorenih: 0 P1 / 7 P2 / 3 P3).

## Migracija, rollout i rollback

- **Nema migracije:** odluka `single_transaction` ne uvodi kolonu, indeks ni tabelu; `Problem.knowledgeArticleId`
  i `KnowledgeArticle` relacija su dovoljni jer su svi upisi u jednoj transakciji. Latest migracija ostaje
  `20271201000000_problem_create_idempotency` (117 ukupno), pa sentinel `database-runtime-contract.spec.ts` nije
  mijenjan.
- **Deployment:** standardni redeploy, bez manualnih koraka i bez feature flaga.
- **API kompatibilnost:** tijelo zahtjeva nepromijenjeno; odgovor je isti objekat `{ id, title, status }`, sada sa
  statusom 200 za svježi create i za replay. Klijenti koji su očekivali 201 za create dobijaju 200 — frontend iz
  ovog repozitorija tretira sve 2xx isto. `GET …/draft` i njegov 409 `PROBLEM_ARTICLE_EXISTS` nepromijenjeni.
- **Rollback:** aplikacijski rollback je siguran (stari kod ponovo kreira članak prije linka i nema novih kolona);
  schema rollback nije potreban jer schema nije mijenjana. Legacy orphan draftovi, po odluci `none`, ostaju
  netaknuti i u rollbacku.

## Lokalna provjera i ograničenja

- `npm run audit:traceability` — 694/694, P1 174 / P2 370 / P3 150, plan sinhronizovan.
- `npm run wiring:check` — 99 controllera / 626 ruta, manifest sinhronizovan (nema novih ruta).
- `eslint` nad promijenjenim backend fajlovima i `npm run lint` u `backend/` — 0 grešaka; tri preegzistentna
  `no-explicit-any` upozorenja su u `sla/sla-scan-failure-quarantine.spec.ts`, van ovog paketa.
- Frontend: `tsc --noEmit`, `eslint`, `prettier --check .` i `vitest` nad `components/problems` — čisto.
- Lokalna ograničenja sandboxa: nema `prisma generate` (nema izlaza na `binaries.prisma.sh`) ni PostgreSQL-a, pa je
  backend testiran kroz `ts-jest` sa sandbox-only stubom generisanog klijenta (`backend/src/generated`, gitignored) i
  bez DB suiteova; lokalni `tsc` zato nije mjerodavan i neočekivane `PrismaService` greške su artefakt stuba.
  Stvarni typings, full Jest i integracija dokazani su u CI-ju.

## Sljedeći paket

**W7.28 — `BA-problems-10` (P2):** stara grupa ne smije predati problem novoj grupi bez target-group authority i
prihvata (acceptance iz audit 23 §7). Nije započet prije zelenog gatea za ovaj paket.
