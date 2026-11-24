# W7.114 — `BA-search-13`: `/search` na žici (E2E) i dokaz da „compile-blocked” više ne stoji

**Paket:** Val 7, `search`, **P3** — **test-only** (bez promjene produkcijskog koda)<br>
**Nalaz:** „Glavni service suite je compile-blocked i nema direktnog `/search` E2E”<br>
**Kod:** bez izmjena (`search.controller.ts`, `search.service.ts`, DTO i guard ostaju netaknuti)<br>
**Testovi:** novi `e2e/tests/60-search-command-palette.spec.ts` (3 testa); backend unit suite bez izmjena<br>
**DB migracija:** ne<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** [run `45369425277`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45369425277) ✓ na
`a91cd81` (push: backend `check:prisma-generated` + pun Jest, PostgreSQL/Redis integracija, frontend, docs guard,
container/supply-chain); [run `45369430547`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45369430547)
✓ sa **`specs="60"`** — Playwright **3 passed / 0 failed / 0 flaky / 0 skipped** (25,3 s) na živom stacku

## Nalaz

Nalaz je imao dva dijela, i prvi je bio **tvrdnja o stanju okruženja**, ne o kodu:

1. u auditnom presjeku (§8) glavni service suite je zaveden kao **„compile-blocked”** — 1/2 suitea zelen, a
   `search.service.spec.ts` se „nije izvršio zbog nepotpunog generated Prisma/`PrismaService` contracta u
   transitivnom routing kodu (`group` i `service` delegati nedostaju)”;
2. nije bilo **nijednog direktnog E2E** za `GET /search` i za klik na rezultat u paleti — unit suiteovi dokazuju
   pravila, ali ne i da ih *deployani rub* (session guard → role guard → rate-limit guard → validation pipe →
   controller mapping → HTTP odgovor) i dalje poštuje.

Oba dijela su zatvorena: prvi **dokazom da je tvrdnja zastarjela** (ne prepravkom testa), drugi novim specom.

## 1. Zašto „compile-blocked” danas ne može biti tačan

Tvrdnja je imenovala uzrok: u generisanom Prisma klijentu nije bilo `group` i `service` delegata, a routing kod
koji ticket grana tranzitivno uvozi ih koristi — pa TypeScript nije mogao da kompajlira suite.

**Danas ti delegati postoje u generisanom klijentu koji je u repozitoriju:**

| Delegat | Fajl | Linija |
| --- | --- | --- |
| `service` | `backend/src/generated/prisma/internal/class.ts` | 521 (`get service(): Prisma.ServiceDelegate<…>`) |
| `group` | `backend/src/generated/prisma/internal/class.ts` | 731 (`get group(): Prisma.GroupDelegate<…>`) |

I, važnije, **CI više ne može tiho pasti u to stanje** — backend posao generiše klijent iz šeme prije testova i
provjerava ga odvojenim guardom:

```bash
npm run db:generate             # ci.yml, backend job
npm run check:prisma-generated  # ci.yml, backend job — prazan/prepolovičan klijent obara posao
npm test -- --ci --coverage=false
```

`check:prisma-generated` (`scripts/check-generated-prisma.mjs`) provjerava da `client.ts`, `enums.ts`, `models.ts` i
`internal/class.ts` postoje, nisu prazni i nose očekivani marker; poruka kvara je uputstvo (`npm run db:generate`),
pa „suite se ne kompajlira” više nije stanje koje se otkrije tek u Jest izlazu.

### 1.1 Dokaz iz izvršavanja (2026-11-24)

```bash
cd backend && npx jest src/modules/search
```

| Suite | Testova | Rezultat |
| --- | ---: | --- |
| `search.service.spec.ts` | 26 | **26 passed** |
| `search-query.dto.spec.ts` | 12 | 12 passed |
| `search-users.spec.ts` | 7 | 7 passed |
| `search-directory-scope.spec.ts` | 11 | 11 passed |
| `search-telemetry.spec.ts` | 11 | 11 passed |
| `search-telemetry.service.spec.ts` | 4 | 4 passed |
| `search-rate-limit.spec.ts` | 9 | 9 passed |
| `search-rate-limit.guard.spec.ts` | 3 | 3 passed |
| `search-rate-limit.configuration.spec.ts` | 4 | 4 passed |
| `search-group-failure.spec.ts` | 4 | 4 passed |
| `normalize-search-query.spec.ts` | 9 | 9 passed |
| `search-query-plan.integration.spec.ts` | 3 | **skipped** (traži `PRIVACY_IT_DATABASE_URL`) |

Ukupno **12 suiteova: 11 zeleno, 1 uslovno preskočen; 103 testa: 100 passed, 3 skipped, 0 failed**. Suite iz
tvrdnje — `search.service.spec.ts` — izvršio se u cjelini, sa svih 26 testova; nije bilo compile faze koja bi ga
preskočila. Uz to: `nest build` zelen, `eslint src/modules/search --max-warnings=0` čist, `wiring:check` 632 rute.

Isti posao (`npm test -- --ci --coverage=false`) izvršava se u CI backend jobu na svakom pushu; master run
[`45365051745`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45365051745) je zelen u svih 10
poslova, a runovi W7.113 (`45361784881`, `45361808432`) takođe — pa tvrdnja nije bila samo lokalna sreća.

**Šta ovo ne tvrdi:** auditna tvrdnja nije bila lažna u trenutku mjerenja (2026-10-23) — bila je tačan opis tadašnjeg
checkouta. Ona je **zastarjela**, i zato je u auditu prepravljena uz zadržan original kao historija, umjesto da se
briše.

## 2. Novi E2E: `e2e/tests/60-search-command-palette.spec.ts`

Spec ima tri testa i dvije namjerne granice: **ne ponavlja** unit matricu, i **ne troši** rate-limit budžet.

### 2.1 HTTP ugovor (dva testa, bez browsera)

Prvi test kreira tiket čiji naslov postoji samo u ovom runu (`E2E paleta <timestamp>`), pa traži taj naslov kroz
`GET /search?q=…` i tvrdi:

- tiket je pronađen, i **projekcija je tačno `{ id, ticketNumber, title }`** — `Object.keys(hit).sort()` je
  ugovor, ne detalj: paleta prikazuje broj i naslov, pa grupa ne smije slati opis, form data ni requestera;
- `articlesIncomplete` je boolean, `articles`/`users` su nizovi, `failedGroups` je **prazan** — prazna grupa je
  legitiman odgovor i ne smije se predstaviti kao kvar;
- `types=ticket` **sužava** odgovor: ticket grupa ostaje, article i user grupe su prazne (ne „sve tri uvijek”).

Drugi test pinuje **refusale na rubu** koje DTO obećava, a koje do sada nijedan E2E nije vidio:

| Zahtjev | Očekivano | Zašto |
| --- | --- | --- |
| `q=%20%20%20` (samo praznine) | `400` | normalizacija ide prije validacije (W7.56); prazan `contains` bi vratio „sve vidljivo” |
| `q=%20a%20` (jedan znak) | `400` | minimalna dužina se mjeri na efektivnom upitu |
| `types=ticket,ticket` | `400` | W7.111: `types` je **set** na žici, ne vreća |
| `types=audit` | `400` | allowlista grupa |
| `limit=26` | `400` | tvrdi plafon od 25 po grupi |
| `sort=title` | `400` | `forbidNonWhitelisted` — nepoznat parametar se ne prima i ne ignoriše |
| bez sesije | `401` | session guard odgovara prije bilo koje grupe i prije rate-limit bucketa |

### 2.2 Klik kroz paletu (treći test)

Superadmin se prijavi kroz UI, otvori paletu header triggerom
(`aria-label` = `palette.open` → „Otvori komandnu paletu” / „Open command palette”) i otkuca naslov iz ovog runa.
Spec čeka **red po broju tiketa**, ne po naslovu — broj je jedinstven i stabilan, pa star ili keširan odgovor ne
može zadovoljiti assert. Zatim klikće red i tvrdi:

- URL je `/tickets/<id>` (href hita se gradi iz odgovora pretrage — pogrešna projekcija ili pogrešan `id` bi otišli
  na drugu stranicu);
- paleta se zatvorila;
- sadržaj tiketa na stranici nosi isti naslov.

Time je zatvoren i drugi dio nalaza: **rezultat pretrage je klikabilan do tiketa koji imenuje**, na živom stacku.

### 2.3 Šta spec svjesno ne radi

- **Ne troši 429.** Budžet je 30 zahtjeva / 60 s po akteru i 60 / 60 s po **adresi**, a svi specovi runa dijele
  adresu (`workers: 1`). Iscrpljivanje bucketa iz browsera otrovilo bi sljedeće specove i oborilo zeleni run iz
  razloga koji nema veze s pretragom. Prozor, oba bucketa, fail-closed `503` i `Retry-After` pokrivaju
  `search-rate-limit.spec.ts` i `search-rate-limit.guard.spec.ts`.
- **Ne testira confidential/arhivu/merge/revoke** — to je W7.113 blok u `search.service.spec.ts`, i tamo mu je
  mjesto (svijet se gradi direktno, bez E2E šuma).
- **Ne mjeri query plan** — `search-query-plan.integration.spec.ts` je PostgreSQL dokaz i ostaje uslovno preskočen
  bez `PRIVACY_IT_DATABASE_URL`.

### 2.4 Pozicija u runu

Broj `60` je slobodan (postojeći specovi idu `01`–`59`, sa duplikatima 54/55) i **posljednji je**, pa čak i da
potroši koji zahtjev iz budžeta, nema speca iza sebe. `describe.configure({ mode: 'serial' })` je namjeran: tiket se
pravi jednom u `beforeAll` i sva tri testa gledaju isti svijet; paralelno izvršavanje bi pravilo tri tiketa i
maskiralo upravo ono što spec dokazuje.

## 3. Dokaz

```bash
cd e2e && npx tsc --noEmit -p tsconfig.json          # strict typecheck svih specova i helpera — čist
cd e2e && npx playwright test tests/60-search-command-palette.spec.ts --list
# [chromium] › 60-search-command-palette.spec.ts:104 › …three groups and a minimal ticket projection
# [chromium] › 60-search-command-palette.spec.ts:136 › …the edge refuses what the DTO refuses…
# [chromium] › 60-search-command-palette.spec.ts:157 › …a palette hit opens the ticket it names
# Total: 3 tests in 1 file
```

Browser izvršavanje traži živu instalaciju (`E2E_BASE_URL`, `E2E_API_URL`, aktori), pa se pokreće u CI-ju; komanda
za trijažu samo ovog speca:

```bash
gh workflow run ci.yml --ref <branch> -f specs="60" -f retries=1 -f skip_gates=true
```

Bez `specs` (prazan input) run je **pun** E2E suite. Nepoznat broj speca ne pada tiho na „sve”: posao izlazi sa
`::error title=Unknown spec::` prije Playwrighta, pa zelen dispatch sa `specs="60"` znači da je **taj** fajl izvršen.
Ovaj paket je izvršen tako: run `45369430547`, `stats { expected: 3, unexpected: 0, flaky: 0, skipped: 0 }`.

## 4. Šta paket mijenja, a šta ne

- **Mijenja:** jedan novi E2E fajl (`e2e/tests/60-search-command-palette.spec.ts`) i dokumentaciju.
- **Ne mijenja:** produkcijski kod, šemu, migracije, rute (632), frontend, env ugovor.
- **Ne mijenja:** nijedan postojeći spec — ni `22-accessibility.spec.ts` (koji paletu otvara i zatvara) ni
  `54-shell-responsive.spec.ts` / `56-definitive-frontend-closeout.spec.ts` (koji koriste isti trigger).

## 5. CI

- `e2e` posao: `typed` korak (`npx tsc --noEmit -p tsconfig.json`) + offline helper testovi + preflight + browser
  run; smoke podskup na PR-u (`01,02,03,15,22,54`) **ne uključuje** `60`, pa se ovaj spec izvršava na dispatchu i u
  noćnom (`schedule`) punom runu.
- Backend posao dokazuje prvi dio nalaza (generisanje + `check:prisma-generated` + pun Jest).

Rezultati ovog paketa (popunjeno nakon runa):

| Run | Obim | Rezultat |
| --- | --- | --- |
| [`45369425277`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45369425277) (push, `a91cd81`) | backend build + **pun Jest** (uključuje `search` suite), PostgreSQL/Redis integracija, frontend build+test, docs guard, container/supply-chain | **success** (10/10 poslova; E2E poslovi `skipped` jer push nije PR/schedule/dispatch) |
| [`45369430547`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45369430547) (dispatch, `specs="60"`, `skip_gates=true`) | `E2E critical flows` na živom stacku, samo `60-search-command-palette.spec.ts` | **success** — Playwright **3 passed / 0 failed / 0 flaky / 0 skipped**, 25,3 s; `CI gate` success |

## 6. Otvoreno i dokumentovano

- **Smoke podskup ne pokriva paletu.** PR gate ostaje `01,02,03,15,22,54`; ako se traži da pretraga bude u PR
  gateu, to je odluka o budžetu runa (spec 60 traje ~30 s i pravi jedan tiket), ne o kodu.
- **Paleta je testirana superadminom.** Najširi akter dokazuje put i projekciju; sužena vidljivost (agent, requester,
  confidential, cross-OU imenik) dokazana je unit matricom i postojećim specovima 06/22.
- **`BA-search-13` je posljednji nalaz modula i Vala 7.** `search` je **13/13**, Val 7 **111/111**; nema P1 ni P2 u
  cijelom valu.
