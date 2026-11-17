# Package closeout — W7.28

**Paket:** W7.28 — problem group handoff<br>
**Nalaz:** `BA-problems-10` (P2) — zatvoren<br>
**Kodni commit:** `6a41a29` (paket: `01ca975`, `6622566`, `f892c6d`, `22bc42d`, `6a41a29`)<br>
**Finalni testani SHA:** `6a41a29`<br>
**CI:** [`44139365349`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44139365349) — zelen<br>
**DB migracije:** `20271201010000_problem_handoffs` — primijenjena nakon izričite dozvole vlasnika (2026-11-17)

## Nalaz i acceptance

Stara grupa je mogla promijeniti grupu problema običnim `PATCH /problems/:id` (`groupId`) — bez ijedne provjere
autoriteta nad **ciljnom** grupom, bez prihvata ciljne grupe i bez zapisa ko je tražio, ko je odlučio i zašto.
Ciljna grupa je tek poslije dobijala notifikaciju „dodijeljen vam je problem”, kao da je predaja već gotova.
Ista rupa je postojala za organizacionu jedinicu: problem se mogao premjestiti u OJ izvan drveta svoje grupe.

Acceptance kriterij paketa: promjena grupe postoji **samo** kao zapisana predaja sa autoritetom i prihvatom ciljne
grupe; predaja je u opsegu podnosica i primaoca; odluka je u historiji i auditu; ostatak lifecyclea (status, target,
bulk resolution, KB, liste, reporti) ostaje nepromijenjen. Model je odabran po kriteriju „profesionalniji pristup,
kvalitet ispred brzine”: predaja je **prvoklasna komanda sa svojim stanjem**, a ne polje; isti režim važi i za
promjenu OJ, jer OJ bez grupe mijenja vlasništvo nad problemom.

## Implementacija

- **Model `ProblemHandoff`** (`problems.prisma`): `fromGroupId`/`toGroupId`, `fromOrganizationalUnitId`/
  `toOrganizationalUnitId`, `requestedByUserId`, `reason`, `status` (`PENDING|ACCEPTED|REJECTED|CANCELLED`),
  `decidedByUserId`, `decisionReason`, `decidedAt`. Djelimični unique indeks dozvoljava **najviše jednu** predaju
  koja čeka po problemu; `P2002` se prevodi u `PROBLEM_HANDOFF_PENDING`, pa dvostruki klik ne pravi drugu predaju.
  Indeks `toOrganizationalUnitId_status` drži listu „čeka odluku ove OJ” jeftinom.
- **`ProblemHandoffService`** (`list`/`request`/`accept`/`reject`/`cancel`): ciljna grupa mora biti problem-grupa,
  ciljna OJ mora biti u opsegu podnosioca i u drvetu ciljne grupe (`assertUnitFollowsGroup`), razlog ≥ 5 znakova.
  Ako podnosilac **ima** `problem.manage` autoritet nad ciljnom grupom, predaja se prihvata odmah u istoj
  transakciji (nema besmislenog čekanja na samog sebe); inače ostaje `PENDING` i problem **ostaje** u staroj grupi.
  Prihvat je uslovljen `updateMany` sa `version` CAS-om i provjerom da je problem još u izvornoj grupi
  (`PROBLEM_HANDOFF_CONFLICT`), pa dvije paralelne odluke ne mogu obje proći. Prihvat pomjera `groupId` i
  `organizationalUnitId`, rješava vlasnika (zadržava ga ako pripada ciljnoj grupi, inače ga preuzima upravitelj koji
  prihvati; `NEW` može ostati bez vlasnika), upisuje `ProblemEvent` i audit red. Odbijanje i otkazivanje ne diraju
  problem. Prelazak u konačni status otkazuje predaju koja čeka u **istoj** transakciji
  (`decisionReason: 'problem_final_status'`).
- **`PATCH /problems/:id`** više ne mijenja grupu: `groupId` promjena → `409 PROBLEM_HANDOFF_REQUIRED`; OJ izvan
  drveta grupe → isti kod sa `detail: 'organizationalUnitId'`; OJ unutar drveta ostaje običan update.
- **API:** `GET/POST /problems/:id/handoffs`, `POST /problems/:id/handoffs/:handoffId/accept|reject|cancel` — svi
  `200` sa `{ handoff, problem }`; greške `PROBLEM_HANDOFF_REQUIRED|PENDING|CONFLICT|SAME_GROUP` (409) i
  `PROBLEM_HANDOFF_NOT_FOUND` (404). Detalj problema nosi `handoff` (samo `PENDING`) i
  `permissions.canHandoff|canDecideHandoff|canCancelHandoff`; historija prihvata `handoff_*` akcije.
- **Notifikacije:** `problem.handoffRequested` ide upraviteljima **ciljne** grupe, `problem.handoffDecided`
  podnosiocu; vlastita kategorija preferencija `problem.handoff` (odmah, in-app + e-mail), pa predaja nije ni
  tiho ugašena ni spojena sa assignment notifikacijama.
- **Frontend:** panel na detalju prikazuje čekajuću predaju (iz koje u koju grupu/OJ, ko je tražio, kada, zašto) i
  daje tačno one akcije koje server dozvoljava; problem manager može predaju i pokrenuti iz panela. Edit sheet više
  ne šalje promjenu grupe kao polje: prvo čuva ostale podatke, pa traži predaju sa obaveznim razlogom, a ako drugi
  korak padne, izričito kaže da su podaci sačuvani a predaja nije zatražena. Historija, greške, nazivi audit akcija
  i notifikacija prevedeni su u bs/en.
- **Van scopea:** nema automatske eskalacije predaje koja dugo čeka, nema bulk predaje, povezani tiketi se ne
  prenose (ostaju uz problem), a reconcilijacija owner eligibilityja nakon revokea ostaje `BA-problems-15`.

## Direktni testni dokaz

- `backend/src/modules/problems/problem-handoff.service.spec.ts` (13) — trenutni prihvat kad podnosilac vodi obje
  grupe; čekanje kad ne vodi; odbijanje konačnog problema, iste grupe i druge predaje; provjera opsega ciljne OJ i
  autoriteta; konflikt kad je problem u međuvremenu promijenjen; prihvat pomjera grupu/OJ i rješava vlasnika;
  zadržavanje vlasnika koji već pripada ciljnoj grupi; odbijanje/otkazivanje ne diraju problem; notifikacije i audit.
- `backend/src/modules/problems/problem-handoff-guards.spec.ts` (9) — `PATCH` odbija promjenu grupe i OJ izvan
  drveta, dozvoljava OJ unutar drveta; konačni status otkazuje predaju sa `problem_final_status`; detalj izlaže
  predaju i tačna prava po strani (uključujući podnosioca koji smije otkazati).
- `backend/src/modules/notifications/preferences/notification-preferences.spec.ts` — svaki tip notifikacije ima
  tačno jednu kategoriju, pa i `problem.handoffRequested|Decided`.
- `frontend/src/components/problems/problem-handoff-panel.spec.tsx` (7) — prikaz čekajuće predaje, prihvat,
  odbijanje samo sa razlogom, otkazivanje, prikaz bez akcija za treću stranu, greška inline, pokretanje predaje.
- `frontend/src/components/problems/problem-form-sheet.spec.tsx` (3) — promjena grupe šalje osnovne podatke bez
  `groupId`/`ownerUserId` pa predaju; pad predaje prijavljuje djelimičan uspjeh; nepromijenjena grupa ostaje običan
  update.
- `frontend/src/lib/problems/problem-view.spec.ts` — nazivi svih `handoff_*` redova historije i mapiranje pet
  `PROBLEM_HANDOFF_*` kodova; `frontend/src/i18n/admin-ops-i18n-coverage.spec.ts` — četiri nove audit akcije
  postoje u backend enumu, frontend katalogu i oba prevoda.

## CI i testni dokaz

CI run [`44139365349`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44139365349) na `6a41a29`:

- **Backend build + test:** success (generisani Prisma, build, lint, pun Jest, safety-net).
- **PostgreSQL + Redis integration:** success (disposable instanca; migracije kroz release migrator — nova migracija
  je vježbana u tranzijentu, ali **nije** primijenjena na ciljnu bazu).
- **Frontend build + test:** success (lint, format, 455 fajlova / 1787 testova, build, bundle budget).
- **Docs guard, container + supply chain, Detect changes, CI gate:** success.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory` — push workflow
  ih ne pokreće.
- **Docs-only commit:** `ee5492d` (ovaj closeout) nije pokrenuo CI jer push workflow ima `paths-ignore`
  `docs/**`/`**/*.md`; zato je jedini mjerodavni zeleni run onaj na `6a41a29`.
- **Neuspjeli pokušaji:** `44132873063` na `f892c6d` — frontend je pao na `module-size.spec.ts` jer je
  `services/problems-api.ts` prešao 578 linija (vlastita greška; handoff API preseljen u
  `services/problem-handoffs-api.ts`) i na `lib/problems/problem-view.ts` (321 > 320 linija; suvišni komentari
  uklonjeni). `44136465539` na `22bc42d` — `admin-ops-i18n-coverage.spec.ts` nije imao četiri nove audit akcije u
  `knownAuditActions` i u bs/en katalogu (vlastita greška; dopunjeno). Oba su popravljena prije zelenog runa.

Dodatne lokalne provjere: ciljani backend Jest `src/modules/problems` + `src/modules/audit-log` +
`src/modules/notifications/preferences` = 47 suiteova / 293 testa prolazi; `tsc -b`, `eslint .`,
`prettier --check`, `npm run build`, `check-pulse-design-system` (i18n parity) i `check-frontend-docs` prolaze.
Puni backend Jest nije izvršiv u sandboxu (`Reached heap limit`), pa je oslonac na CI-ju; `npx prisma validate` je
blokiran bez `DATABASE_URL`. Sandbox je više puta vraćan na stariji commit, pa je rad commitovan u koracima.

## Registar nalaza

- Zatvoreni: `BA-problems-10`.
- Ostaju otvoreni: `BA-problems-11`–`19`, te svi P1 nalazi modula (`BA-changes-02`–`07`,
  `BA-knowledge-base-01`–`04`, `BA-reports-01/02`, `BA-search-01`, vlasnik `WS-F`).
- Kontrolni zbir: source/plan **443** otvorenih / **251** zatvorenih / **694** ukupno (P1 174 = 101/73); ovaj
  registar **453/241**; Val 7 **30/109** (79 otvorenih: 13 P1 / 46 P2 / 20 P3); modul `problems` **10/19**
  (9 otvorenih: 0 P1 / 6 P2 / 3 P3).

## Migracija, rollout i rollback

Migracija `20271201010000_problem_handoffs` je **add-only** (nova tabela, dva nova FK-a, djelimični unique i jedan
indeks; bez `DROP`/`TRUNCATE`), sentinel u `database-runtime-contract.ts`/`.spec.ts` je podignut, a
`check-migration-policy.mjs` prijavljuje 118 migracija. Vlasnik je 2026-11-17 dao izričitu dozvolu i migracija je
uspješno primijenjena na njegovoj instalaciji (potvrđeno u razgovoru; primjena nije nezavisno provjerena iz ovog
okruženja). Redoslijed je bio: dozvola → `prisma migrate deploy` na ciljnoj bazi → deploy koda. Bez
migracije novi kod ne radi (tabela ne postoji), pa stari kod mora ostati aktivan do primjene. Rollback: prvo vratiti
kod na prethodni release (stari kod ne poznaje tabelu), pa `DROP TABLE "ProblemHandoff"` — nema drugih zavisnosti i
nema backfill-a jer predaje nastaju tek poslije deploya. API je aditivan: `PATCH` sa `groupId` sada vraća 409, što je
namjerna, dokumentovana promjena ugovora.

## Sljedeći paket

**W7.29 — `BA-problems-11` (P2):** service/incident linkovi moraju poštovati scope policy svog izvornog domena
(`service.read`/status-page scope) i više link writeova mora biti atomsko sa eventom, bez djelimičnog upisa. Nije
započet prije zelenog gatea za ovaj paket.
