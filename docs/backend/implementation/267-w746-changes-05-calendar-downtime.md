# Package closeout — W7.46

**Paket:** W7.46 — calendar downtime prozori poštuju viewer scope<br>
**Nalaz:** `BA-changes-05` (P1) — **zatvoren**<br>
**Kodni commit:** `eea32fa`<br>
**Finalni testani SHA:** `eea32fa`<br>
**CI:** [`44406819251`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44406819251) — zelen (16m19s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `24-changes.md` §5 (drugi pasus) i §19 točka 3: calendar scope-filteruje changeove, ali downtime query
**nema nikakav viewer filter** — svaki `change.read` čitalac vidio je **sve** service downtime prozore
instalacije, sa imenom servisa, porukom i `changeRequestId` (tuđi change). To je direktan cross-OU/service
leak operativnog rasporeda.

Acceptance: (1) prozor vezan za change vidljiv je samo ako čitalac smije čitati taj change, (2) ručno unesen
prozor (bez vlasnika) ostaje javan jer nije ničiji raspored, (3) filter ide **u SQL**, da skriveni redovi ne
mogu istisnuti vidljive kroz `take`, (4) skriveni prozori se broje i UI to kaže umjesto tihog nestanka, (5)
zelen CI gate.

## Implementacija

- **`calendar()`** gradi `downtimeWhere` sa `OR: [{ changeRequestId: null }, { changeRequest: visible }]`,
  gdje je `visible = changeVisibilityWhere(scope, viewer.userId)` — **isti** predikat kao lista changeova (OU
  scope + requester/owner/CAB izuzeci). Za viewera bez OU granice `visible === null`, OR izostaje i nema
  dodatnih upita.
- **`restrictedDowntime`** — paralelni `count` sa inverznim predikatom (`changeRequestId: { not: null }`,
  `NOT: { changeRequest: visible }`), pa odgovor nosi tačan broj skrivenih prozora. `truncated` ostaje
  definisan nad **vidljivim** redovima (ranije je miješao skrivene).
- **Odgovor** dobija `restrictedDowntime: number`; `freezePeriods`, `changes` i redoslijed su nepromijenjeni.
- **Frontend:** `ChangeCalendar` tip dobija **opcionalno** `restrictedDowntime` (stariji server ga ne šalje),
  a `change-calendar.tsx` prikazuje rečenicu sa brojem (`changes.calendar.restrictedDowntime`, bs plural
  `_one/_few/_other`, en `_one/_other`) iznad legende. Bez nove rute ili stanja ekrana.
- **Nije promijenjeno:** `changes` lista (već scopeovana), preview konflikti (`BA-changes-04`, W7.45),
  `hasDowntimeDrift`/reconciler (sistemska provjera, ne korisnički response) i zapisivanje downtime prozora
  (`syncDowntime`).

## Direktni testni dokaz

`backend/src/modules/changes/changes-calendar-scope.spec.ts` (3 testa):

- scoped čitalac: `serviceDowntimeWindow.findMany.where` = `{ startsAt, endsAt, OR: [{ changeRequestId: null },
  { changeRequest: <changeVisibilityWhere> }] }` — provjeren i tačan OU predikat i requester izuzetak;
- skriveni prozori: `count` se izdaje sa `changeRequestId: { not: null }` i `NOT: { changeRequest: ... }`,
  a `restrictedDowntime` nosi vrijednost (3) uz `truncated: false`;
- viewer bez OU granice: nema `OR` filtera, `count` se **ne** izdaje, `restrictedDowntime = 0`, a prozor sa
  tuđim `changeRequestId` i dalje je vidljiv (globalni čitalac).

Frontend: `vitest src/i18n src/lib/changes src/components/changes` (13 fajlova / 68 testova) i
`module-size` (300 linija u `change-calendar.tsx`, ispod granice) prolaze; `prettier --check` i `eslint` čisti.

## CI i testni dokaz

CI run [`44406819251`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44406819251) na `eea32fa`:

- **Backend:** generisani Prisma, wiring manifest, build, lint, safety-net i pun Jest (uključujući novi
  `changes-calendar-scope.spec.ts`) — uspješno.
- **PostgreSQL/Redis integration:** postojeći `changes` suiteovi (uključujući downtime sync/reconciler) —
  uspješno.
- **Frontend:** lint, format (Prettier), testovi, build i bundle budget — uspješno.
- **Docs guard / container / CI gate:** uspješno.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard`.

**Neuspjeli pokušaji:** nema — prvi run je zelen.

Dodatne lokalne provjere i ograničenja: cijeli backend unit run ostaje na poznatom sandbox baselineu (11
padajućih suiteova su Prisma stub artefakti — `Prisma.sql`/`$queryRaw`; nema novih padova).

## Registar nalaza

- Zatvoreni: `BA-changes-05` (P1).
- Ostaju otvoreni u `24-changes.md`: 15 nalaza (P1: `06`, `07`).
- Kontrolni zbir: plan **430 otvoreno / 266 zatvoreno / 696**; Val 7 **66 otvoreno / 45 zatvoreno / 111**
  (P1 9 / P2 40 / P3 17); registar `BACKEND-FINDINGS-REGISTER.md` **440 / 256 / 696**.

## Migracija, rollout i rollback

Nema migracije. API se sužava: kalendar više ne vraća tuđe downtime prozore, nego `restrictedDowntime` broj;
frontend tretira polje kao opcionalno. Nema promjene zapisa podataka. Rollback: revert `eea32fa` (kalendar
ponovno prikazuje sve prozore; podataka nema za vraćanje).

## Sljedeći paket

**W7.47 — `BA-changes-06` (P1):** CAB voter/quorum mora biti zamrznut za rundu, a glasovi bivših/neeligible
članova ne smiju retroaktivno odlučivati round. Nije započet prije zelenog gatea za ovaj paket.
