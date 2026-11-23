# W7.109 — `BA-reports-19`: failure/concurrency matrica je izvršna, ne lista u dokumentu

**Paket:** Val 7, `reports`, **P3**<br>
**Nalaz:** „Dvanaest suiteova je compile-blocked; failure/concurrency/Redis/SMTP matrica nedostaje”<br>
**Kod:** `backend/scripts/reports-test-matrix.json` (**novo** — 46 redova / 10 kategorija / 12 scenarija),
`backend/scripts/run-reports-test-matrix.mjs` (**novo** — `validateReportsTestMatrix` + CLI sa `--check-only`),
`backend/scripts/run-reports-test-matrix.test.mjs` (**novo**, 10 testova self-testa), `backend/package.json`
(`test:reports:matrix`, `test:reports:matrix:check`), `.github/workflows/ci.yml` (docs guard: dvije nove provjere)<br>
**Specovi:** bez novih produktnih testova — matrica imenuje **postojeće** dokaze (24 spec fajla: 16 unit, 8 PostgreSQL)<br>
**DB migracija:** ne<br>
**Rute:** nepromijenjene (632)<br>
**CI:** _popunjava se nakon push-a_

## Nalaz

Nalaz ima dva dijela, i oba su bila tačna u trenutku audita (2026-10-23):

1. **Dvanaest od 27 suiteova nije ni kompajliralo.** Uzrok nije bio u testovima: nedostajao je
   `generated/prisma/client`/`enums`, a `PrismaService` nije imao delegate ni `$queryRaw`. Ishod je bio gori od
   crvenog testa — suite se nije izvršio, pa je „nema padova” izgledalo kao zeleno.
2. **Osam rizičnih oblasti nije imalo nijedan test:** huge corpus, attachment filter parity, foreign filter IDs,
   concurrent schedule limit/update, Redis flush, SMTP accepted-crash, run retention i privacy/anonymization.

Drugi dio je danas faktički pokriven — W7.93–W7.108 su zatvorili nalaze modula, gotovo svaki sa svojim unit i/ili
PostgreSQL dokazom. Ali **niko nije mogao reći koji test dokazuje koji scenario bez ručnog pretraživanja**, i ništa
nije sprječavalo da se taj test preimenuje, preskoči ili izbriše dok audit i dalje tvrdi pokrivenost. Isti obrazac se
već jednom dogodio: §10 audita je do danas nosio snimak „15 od 27 prolazi, dvanaest ne kompajlira” kao da je aktualan.

## Rješenje

**Matrica je fajl koji mašina provjerava, a ne tabela koja stari.** Obrazac je isti kao W7.92 u `knowledge-base`,
jer je i problem isti.

### `reports-test-matrix.json`

Deset kategorija (`compile`, `corpus`, `scope`, `attachments`, `concurrency`, `redis`, `smtp`, `failure`,
`retention`, `privacy`) i **46 redova**; svaki red ima `scenario` (jedan od 12), `what` (ljudski opis), `spec` i
**`test`** — tačno ime testa u tom specu:

```json
{
  "smtp": [
    {
      "scenario": "SMTP accepted-crash",
      "what": "a lost SENT mark leaves a CLAIMED row and the report is never sent twice",
      "spec": "src/modules/reports/schedules/report-schedule-delivery-crash-window.integration.spec.ts",
      "test": "leaves a CLAIMED row when the SENT mark is lost, and never sends that report twice"
    }
  ]
}
```

Ime testa je namjerno dio ugovora: putanja sama ne dokazuje ništa — fajl može postojati i ne sadržavati nijedan
test, ili sadržavati drugi test od onog koji je nalaz zatvorio.

**Kategorija `compile` ima 12 redova** — po jedan za svaki suite koji je 2026-10-23 bio blokiran (summary counteri,
SLA summary, dashboard agregacija, trendovi, pack servis, limit/version/tombstone/audit-atomicity/run-now/crash-window/
reconcile integracije). Time „kompajlira se” postaje provjera, a ne sjećanje; puni dokaz je CI, gdje backend posao
izvršava cijelo `src/modules/reports` stablo nad generisanim Prisma klijentom i pravim PostgreSQL/Redis servisima.

### `run-reports-test-matrix.mjs`

`validateReportsTestMatrix(...)` je čista funkcija (dobija `matrix`, `readSpec`, `specExists`,
`integrationRegistry`, `auditDoc`), a CLI je tanka ljuska oko nje. Guard pada ako:

1. **test ne postoji** — spec fajl nedostaje ili ne sadrži ime testa iz matrice;
2. **test je preskočen** — `it.skip`, `xit`, `xdescribe`, `test.skip` u navedenom specu (uslovni
   `describe.skip` za bazu/Redis je dozvoljen, jer CI obezbjeđuje i jedno i drugo);
3. **PostgreSQL spec nije registrovan** u `scripts/run-isolated-integration.mjs` — integracioni spec koji nije u
   registru se kompajlira i onda **nikad ne izvrši**;
4. **scenario iz §10 ostane bez reda**, ili matrica koristi kategoriju/scenario koji nije u §10 listi;
5. **audit 26** ne upućuje na matricu ili ponovo nosi zastarjelu tvrdnju (`15/27 suiteova prošlo`,
   `12/27 compile-blocked`).

Bez `--check-only` skripta izvršava i sve unit specove iz matrice (`npm run test:reports:matrix` — 16 suiteova /
142 testa), pa je matrica upotrebljiva i kao fokusiran lokalni run. `--check-only` je ono što CI izvršava u **docs
guard** poslu (bez `npm ci`, bez baze, ~0,2 s), jer je to jedini posao koji se izvršava i na docs-only izmjenama.

### Šta je bilo pokriveno, a šta dodato

Matrica **nije donijela nove produktne testove** jer nije bilo praznih ćelija: svih osam oblasti iz §10 i sve
compile-blokade imaju dokaz koji su napisali W7.93–W7.108. Ono što je dodato je **veza scenario → test i mašinska
provjera te veze**:

- **compile** (12) — summary/SLA/dashboard/trends/pack servis + sedam PostgreSQL integracija;
- **corpus** (3) — budžet redova, `budget + 1` upit i oznaka donje granice u pregledu;
- **scope** (3) — parent/sibling/prefix, imenovanje polja i legacy red sa stranom grupom;
- **attachments** (3) — prilozi iz schedule slice-a, izostavljen pack koji ne može primijeniti slice, time tracking
  kroz tiket;
- **concurrency** (6) — limit, dvije verzije istog reda, delete po verziji, osam paralelnih komandi, dupli manual run,
  slot koji je već zauzet;
- **redis** (4) — bez klijenta, klijent koji baca, wipe pa recompute, izgubljena scheduler registracija;
- **smtp** (5) — accepted-crash u tri oblika, stale claim i samo podobni primaoci;
- **failure** (4) — fail-closed preview audit, DB greška retentiona, greška do BullMQ-a, nedostajući raspored;
- **retention** (3) — prozor i cutoff, tombstone, retention sa isključenom isporukom;
- **privacy** (3) — matrica modela, scrub run JSON-a, puna anonimizacija na PostgreSQL-u.

## Posljedice po ponašanju

- Nijedna promjena produktnog koda, ruta (632) ni migracija (125).
- CI docs guard sada provjerava i matricu: brisanje ili preimenovanje dokaza obara build, umjesto da tiho smanji
  pokrivenost.
- §10 audita više ne nosi zastarjeli snimak: on je eksplicitno označen kao stanje **u trenutku audita**, a status
  pokazuje matricu.

## Testni dokaz

`run-reports-test-matrix.test.mjs` (**novo, 10**): prihvata ispravnu matricu; odbija spec koji ne postoji, preimenovan
test, preskočen test (`xit`), praznu kategoriju, scenario koji nije u §10 listi, scenario bez reda, red bez imena
testa ili opisa, te audit bez linka ili sa starom tvrdnjom; **dozvoljava** uslovni `describe.skip` koji čeka bazu ili
Redis.

Lokalno: `npm run test:reports:matrix:check` → `Reports test matrix: 10 kategorija, 12 scenarija, 46 redova, 24 spec
fajlova (16 unit, 8 PostgreSQL)`; `npm run test:reports:matrix` → **16 suiteova / 142 testa** zeleno;
`node --test backend/scripts/run-reports-test-matrix.test.mjs` → **10/10**.

## Dokaz

CI: _popunjava se nakon push-a_ (vidi `## 35` u [26-reports.md](../audits/26-reports.md)).

## Otvoreno i dokumentovano

- **E2E nije proširen.** Matrica dokazuje ugovore na sloju servisa, transakcije, CAS-a, locka i Redis/PostgreSQL
  supstrata; browser-scenario za SMTP/Redis kvar nije reproducibilan u E2E okviru bez injektiranja kvarova, što bi
  tražilo zasebnu infrastrukturu. To je svjesno prihvaćen residual, isti kao u W7.92.
- **Matrica ne zamjenjuje CI.** `--check-only` provjerava da dokazi postoje i nisu preskočeni; izvršavanje punog
  `reports` stabla (sa PostgreSQL i Redis servisima) ostaje u backend poslu.
- **Novi scenario traži nov red i novu listu.** Ako se otvori nova oblast (npr. `outbox` kvar), mora se dodati u
  `matrixScenarios` i u §10 audita — inače guard pada, što je i namjera.
