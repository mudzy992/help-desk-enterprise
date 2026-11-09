# W6.47 — `BA-announcements-04`: DB agregati, ograničena pending lista i CSV export budžet

**Status:** `BA-announcements-04` zatvoren na finding nivou nakon push-triggered CI-ja [`42579038875`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42579038875) (**success**).<br>
**Kod i testani SHA:** [`598cdc7`](https://github.com/mudzy992/help-desk-enterprise/commit/598cdc797ee6bc287ac5141305e38c3d627687fe).<br>
**Scope:** samo audit-order Val 6 P1 `BA-announcements-04`; P2/P3, BA-15 full critical-flow acceptance i druga Val 6 područja nisu obuhvaćena.<br>
**Datum:** 2026-10-29

## Korekcija

Report je učitavao cijelu aktuelnu publiku, e-mailove i sve acknowledgement redove u aplikacijsku memoriju. JSON je prikazivao samo prvih 200 pending imena tek nakon učitavanja cijelog skupa, a CSV nije imao čvrst export budžet.

- `report()` sada koristi Prisma `groupBy` agregate po `organizationalUnitId` za aktuelnu publiku i acknowledged članove. Ukupan acknowledgement broj i pending broj dolaze iz DB `count`; identiteti se učitavaju odvojeno i samo za prvu stranicu do **200** pending korisnika. Ta pending lista vraća ID, ime i OU, ne e-mail.
- `GET /announcements/manage/:id/report/pending` vraća bounded stranicu, ukupan trenutni `pendingCount` i announcement-bound opaque cursor. Keyset uslov je `id > cursor`, redoslijed je stabilan po ID-u, a cursor se ne može koristiti za drugi announcement. UI pamti cursor historiju za prethodnu/narednu stranicu i u memoriji zadržava samo trenutno prikazanu stranicu; prelazak na drugu stranicu uklanja identitete prethodne.
- CSV se šalje kao Nest `StreamableFile` iz `Readable` async generatora. Preflight DB count odbija publiku veću od **50.000** redova sa `413` prije dohvaćanja identiteta/e-mailova; keyset queryji zatim vraćaju najviše **500** redova po batchu, a runtime budžet odbija eventualni rast skupa iznad 50.000. Zadržani su UTF-8 BOM i postojeća `csvCell` formula-injection zaštita. Audit metadata ostaje samo `{ rows }`; brojač se uvećava prije predaje CSV chunk-a streamu i ne mijenja postojeći audit schema allowlist.
- `requireReport()` i postojeća scoped report authorization provjera i dalje se izvršavaju prije agregata i PII čitanja. CSV limit ne slabi report scope.

## Granice scopea

Report, pending lista i CSV i dalje koriste **trenutnu publiku**. `audienceSizeAtPublish` i `currentAudienceSize` ostaju odvojeni prikazi; report ne uvodi publish-time membership ledger. Postojeća acknowledgement semantika, uključujući anonymized acknowledgement agregat, nije promijenjena. Zbog toga P2 `BA-announcements-12` — vremenska konzistentnost publish membershipa i reporta — ostaje otvoren. P2/P3 statusi, uključujući P3 pagination scope `BA-announcements-18`, nisu zatvarani ovim paketom; `BA-announcements-08` durable queue/retry rizik takođe ostaje otvoren. BA-15 full critical-flow acceptance ostaje zasebno pending.

## Regresije i provjere

Backend authorization/report testovi pokrivaju DB agregate bez učitavanja cijele publike, bounded cursor-stranice, announcement-bound ID keyset, CSV batch streaming, odbijanje exporta iznad 50.000 prije recipient PII upita i authorization denial prije CSV identiteta. Cursor helper ima zasebne testove za encode/decode i odbijanje nevažećeg ili tuđem announcementu vezanog cursor-a. Frontend regresija provjerava prethodnu/narednu stranicu i da identiteti prethodne stranice nisu zadržani.

Lokalno su prošli:

- targeted backend Jest: **2 suitea / 12 testova** (`diagnostics:false` zbog nedostupnog lokalnog generated Prisma clienta);
- targeted backend ESLint;
- frontend report-dialog Vitest: **3/3**, targeted ESLint, `tsc -b`, `i18n:check` (**8.964 ključa, BS/EN paritet**), Prettier i production build;
- backend wiring check, wiring guard testovi **6/6**, generated wiring manifest **620 ruta** i `git diff --check`.

Lokalni Prisma generate nije mogao preuzeti `schema-engine` sa `binaries.prisma.sh` zbog sandbox mrežnog ograničenja; zato lokalni backend build/type-check nije potvrđen. CI je generisao stvarni Prisma client i finalni generated-Prisma backend build/lint/full Jest je prošao. Prvi push CI [`42577851947`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42577851947) otkrio je nesinhronizovan backend wiring snapshot; manifest je osvježen. Drugi CI [`42578594999`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42578594999) otkrio je `TS2322` jer je CSV batch veličina bila inferirana kao literal `500`; `requestedTake` je eksplicitno tipiziran kao `number`. Finalni CI [`42579038875`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42579038875) na SHA-u iznad je **success**:

- generated-Prisma backend build, lint i full test suite — passed;
- PostgreSQL+Redis integration, uključujući deployment-wide connection budget — passed;
- production image build, SBOM/vulnerability scan i container/supply-chain job — passed;
- frontend build/test, Docs guard i CI gate — passed;
- E2E critical/install, read-only service-form inventory i conditional zero-high/critical enforcement — `skipped`, ne `passed`.

Perf nije pokrenut na W6.47 SHA-u. Posljednji raspoloživi Perf smoke [`42530385320`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42530385320) ostaje **failed** na globalnom query budgetu `2.123 > 2.1`; nema BA-04 uzročne atribucije i prag nije mijenjan.

Nema Prisma schema izmjene ni migracije; target baza nije korištena. Nema PR-a, mergea ili deploymenta. Nakon W6.47 Val 6 je **51/109 zatvorenih, 58 otvorenih (0 P1 / 41 P2 / 17 P3)**; source audit/plan **510/182**, globalni registar **520/172**. Deset ranijih statusnih razlika ostaje netaknuto. U Valu 6 trenutno nema preostalih P1 nalaza, ali Val 6 nije završen; P2/P3 i BA-15 acceptance ostaju otvoreni/pending.
