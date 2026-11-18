# Package closeout — W7.44

**Paket:** W7.44 — direct problem link ponavlja `problem.read` vidljivost i dozvoljeni status<br>
**Nalaz:** `BA-changes-03` (P1) — **zatvoren**<br>
**Kodni commit:** `056d4db`<br>
**Finalni testani SHA:** `056d4db`<br>
**CI:** [`44400859473`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44400859473) — zelen (16m59s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `24-changes.md` §4 (drugi pasus) i §19 točka 2: picker problema poštuje `problem.read` i
`problemVisibilityWhere`, ali je `assertReferences` na **direct `problemId`** — po auditu — provjeravao samo
addon i postojanje, pa je ručno poslan tuđi ID zaobišao search/read politiku, a detail zatim otkrio
broj/naslov/status problema. Audit traži da write **ponovi isti visibility check i dozvoljeni status**.

Provjera koda prije izmjene: vidljivost je u međuvremenu već bila pokrivena (`canReadProblem` u
`assertReferences` i u `toDetail`), pa je stvarni preostali propust bio **status** — picker nudi samo
`status: { notIn: ['CLOSED', 'CANCELLED'] }`, a write je prihvatao i zatvoren problem. Acceptance: (1) tuđi ili
nečitljiv problem ⇒ `CHANGE_PROBLEM_NOT_FOUND` bez potvrde postojanja, (2) čitljiv ali zatvoren/otkazan
problem ⇒ jasna greška umjesto lažnog „ne postoji“, (3) detail i dalje skriva problem koji viewer ne smije
čitati, (4) izmjena koja ne dira problem ne revalidira postojeći link (zatvaranje problema ne blokira
uređivanje changea), (5) zelen CI gate.

## Implementacija

- **`problemLinkStatus(viewer, problemId)`** (novo, privatno u `ChangesService`) — jedan `problem.findFirst`
  sa `AND: [{ id }, problemVisibilityWhere(scope, viewer.userId)]`, `select: { status: true }`. Vraća status
  kad viewer smije čitati problem, inače `null` (nema `problem.read`, modul isključen, izvan OU scopea, tuđi
  ID). Vidljivost koristi **istu** funkciju kao registar problema (`problemVisibilityWhere`), pa nema druge
  istine o tome šta je vidljivo.
- **`assertReferences`** — nakon `problems_disabled` provjere: `null` ⇒ `CHANGE_PROBLEM_NOT_FOUND`,
  `problemFinalStatuses` (`CLOSED`, `CANCELLED`, uvezeno iz `problems.constants`) ⇒ novi
  `CHANGE_PROBLEM_CLOSED` sa statusom u `detail`. Nepoznat ID se i dalje ponaša kao nepostojeći, pa greška
  ne otkriva postojanje.
- **`CHANGE_PROBLEM_CLOSED`** — novi kod u `changes.constants.ts`, mapiran na **409 Conflict**
  (`map-change-error.ts`) i na i18n ključ `changes.errors.problemClosed` u `frontend/src/lib/changes/change-view.ts`
  uz bs/en tekst („Problem je zatvoren ili otkazan i ne može se povezati s promjenom.“). Bez novog UI stanja:
  obrazac za greške change forme već prikazuje mapirani ključ kroz danger toast/inline poruku.
- **Nije mijenjano:** `searchProblems` (već scopeovan), `canReadProblem` u `toDetail` (već filter), problem
  strana linkova (`problems` modul ima svoju politiku), service linkovi (nemaju vlastiti ID u registru —
  ostaje observacija iz §4) i asset linkovi (`BA-changes-02`, W7.43).

## Direktni testni dokaz

`backend/src/modules/changes/changes-problem-link.spec.ts` (8 testova; pravi `problemLinkStatus` uz mockovan
`loadPrincipalContext`):

- scoped viewer: `findFirst` nosi `AND: [{ id: 'problem-1' }, { organizationalUnit: unitScopeWhere(...) }]` —
  dokaz da se koristi **ista** vidljivost kao registar; nepostojeći/tuđi problem ⇒ `CHANGE_PROBLEM_NOT_FOUND`.
- bez `problem.read`: `CHANGE_PROBLEM_NOT_FOUND` i **nula** poziva `problem.findFirst` (fail-closed).
- `CLOSED` ⇒ `CHANGE_PROBLEM_CLOSED` (`detail: 'CLOSED'`), `CANCELLED` ⇒ isto; `INVESTIGATING` prolazi do
  write transakcije (sentinel).
- update samo naslova na changeu čiji je problem u međuvremenu `CLOSED`: `problem.findFirst` **nije** pozvan —
  zatvaranje problema ne blokira uređivanje.
- detail: problem izvan scopea (`problem.count = 0`) ⇒ `problem: null` i naslov se ne pojavljuje u
  serijalizovanom responseu; čitljiv problem ⇒ `{ id, number: 'PRB000003', title, status }`.

Frontend: `change-view.spec.ts` — `CHANGE_PROBLEM_CLOSED` (409) mapira na `changes.errors.problemClosed`;
`src/i18n` suiteovi (uključujući `dynamic-key-contract` i `identical-translations`) prolaze uz nove bs/en
ključeve.

## CI i testni dokaz

CI run [`44400859473`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44400859473) na `056d4db`:

- **Backend:** generisani Prisma, wiring manifest, build, lint, safety-net i pun Jest (uključujući novi
  `changes-problem-link.spec.ts`) — uspješno.
- **PostgreSQL/Redis integration:** postojeći `changes`/`problems` suiteovi — uspješno.
- **Frontend:** lint, format (Prettier), testovi (uključujući i18n i module-size gate), build i bundle budget —
  uspješno.
- **Docs guard / container / CI gate:** uspješno.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard`.

**Neuspjeli pokušaji:** nema — prvi run je zelen. Lokalno su prije commita ispravljene tri stvari u novom
specu (oblik `problemVisibilityWhere` je OU-only, `hasPermission` mock mora padati po permisiji, broj
problema je `PRB000003`), pa CI nije vidio te iteracije.

Dodatne lokalne provjere i ograničenja: `changes` + `problems` **47 suiteova / 357 testova** prolazi;
`npx eslint` na izmijenjenim backend fajlovima čist; frontend `prettier --check`, `eslint` i `vitest`
(`src/i18n` + `src/lib/changes`, 12 fajlova / 64 testa) prolaze. Cijeli backend unit run ostaje na
poznatom sandbox baselineu (11 padajućih suiteova je Prisma stub artefakt, ne regresija).

## Registar nalaza

- Zatvoreni: `BA-changes-03` (P1).
- Ostaju otvoreni u `24-changes.md`: 17 nalaza (P1: `04`, `05`, `06`, `07`).
- Kontrolni zbir: plan **432 otvoreno / 264 zatvoreno / 696**; Val 7 **68 otvoreno / 43 zatvoreno / 111**
  (P1 11 / P2 40 / P3 17); registar `BACKEND-FINDINGS-REGISTER.md` **442 / 254 / 696**.

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. API se sužava: request koji je ranije povezivao zatvoren problem sada
dobija **409 `CHANGE_PROBLEM_CLOSED`** (postojeći linkovi ostaju netaknuti — validacija se izvršava samo kad
se `problemId` mijenja). Frontend je ažuriran za novi kod; stariji klijenti bi vidjeli generičku poruku za
nepoznat kod. Rollback: revert `056d4db` (kod se vraća na `CHANGE_PROBLEM_NOT_FOUND`; podataka nema za
vraćanje).

## Sljedeći paket

**W7.45 — `BA-changes-04` (P1):** conflict preview sa proizvoljnim referencama ne smije otkrivati foreign
change schedule ni identitet (scope-filter kandidata + redakcija nedostupnih konflikata). Nije započet prije
zelenog gatea za ovaj paket.
