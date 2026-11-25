# W2.13 — `BA-groups-03`: fallback grupa je invarijanta (najviše jedna, nikad tiho nula)

**Paket:** Val 2, P1 (routing/lifecycle invarijanta), **size L**<br>
**Nalaz:** „Fallback invariant dopušta nula ili više fallback grupa u istom OU-u”<br>
**Kod:** `modules/groups/{with-group-fallback-lock.ts (novo),assert-fallback-removal-allowed.ts (novo),create-group.ts,update-group.ts,delete-group.ts,groups.error.ts,map-groups-error.ts}`<br>
**Šema:** migracija `20271202130000_group_fallback_cardinality` (dedupe + **partial unique index**), sentinel pomjeren · **Rute:** nepromijenjene (633) · **Env:** nema novih varijabli<br>
**Specovi:** `groups/fallback-cardinality.spec.ts` (**novo, 8**), `groups/fallback-cardinality.integration.spec.ts`
(**novo, 6**, real PostgreSQL), `common/database/database-runtime-contract.spec.ts` (sentinel), fake klijenti u
`groups.service.spec.ts`, `delete-group-scope.spec.ts`, `group-delete-dependencies.spec.ts` i
`install/create-in-memory-install-seed-group-delegate.ts` (novi `count`/`updateMany`)

## Nalaz

`Group.isFallback` je bio **oznaka bez invarijante**:

1. **Najviše jedna** nije bilo ni provjereno ni ograničeno. `create`/`update` su radili „pročitaj postojeće fallbacke →
   `updateMany` na `false` → postavi sebe na `true`", bez ikakvog locka. Dvije transakcije koje pročitaju isto stanje
   (npr. „nema fallbacka") obje prođu i ostave **dvije** fallback grupe u istom OU-u. Baza nije imala šta reći jer
   nije postojao nikakav unique constraint — ni puni ni parcijalni.
2. **Najmanje jedna** nije bilo zaštićeno na nivou PATCH-a: `isFallback=false` na jedinoj fallback grupi je prolazio.
   (Brisanje je W2.12 blokirao, ali gašenje oznake nije.) OU je tako mogao ostati bez fallback destinacije.
3. **Zamjena nije bila atomska.** Zamjena je bila niz od tri write-a u transakciji, ali bez serijalizacije: delete
   grupe koja čita broj fallbacka mogao se umiješati između „pročitaj" i „postavi".
4. **Install seed je mijenjao OU fallback grupe** (`markGroupAsFallback` postavlja i `organizationalUnitId`) bez
   oslobađanja fallbacka u ciljnom OU-u — sa budućim constraintom bi to bio `P2002`, a bez njega duplikat.

Posljedica: `findInstallFallbackGroup` je birao „prvi po `key`" iz skupa koji nije bio skup od jednog elementa, pa je
routing pravilo dobijalo nedeterminističku grupu, a ops-health/seed su prijavljivali fallback koji nije bio jedini.

## Odluka

**Tri sloja, svaki radi ono što mu pripada:**

- **Baza nosi „najviše jednu".** Parcijalni unique index `Group_fallback_per_organizational_unit_key`
  (`ON "Group"("organizationalUnitId") WHERE "isFallback" = true`) čini duplikat nemogućim — i za kod koji zaobiđe
  modul (CLI, seed, budući writer). Puni unique se ne može koristiti jer OU smije imati **nula** fallback grupa.
- **Servis nosi „nikad tiho nula".** Kad grupa koja je fallback prestaje to biti (`PATCH isFallback=false`, ili brisanje
  iz W2.12), broji se preostali fallback; ako ih nema, odgovor je **409 `LAST_FALLBACK_GROUP`**. Politika nije „svaki OU
  uvijek ima fallback" (svježa instalacija ga legitimno nema) nego „write ne smije odvesti OU iz jednog u nula".
- **Zamjena je jedan potez pod lockom.** `PATCH isFallback=true` na drugoj grupi **preuzima** oznaku: stara se oslobađa
  u istoj transakciji i audituje kao `fallback_reassigned`. To je eksplicitni „replace fallback" koji je audit tražio —
  bez novog endpointa, jer je PATCH sa `isFallback=true` već taj command.

**Serijalizacija:** `withGroupFallbackLock` uzima `pg_advisory_xact_lock` **unutar** transakcije, sa ključem
`group-fallback:<organizationalUnitId>`. Lock drži samo OU, ne cijeli modul, i oslobađa se na commit **ili rollback** —
neuspješan zahtjev ne može zaglaviti OU. Uzimaju ga: `createGroup` (samo kad stvara fallback), `updateGroup` (samo kad
mijenja oznaku — rename ne plaća lock), `deleteGroup` (inventar broji fallbacke) i install seed.

**Zašto lock, a ne retry na `P2002`:** retry bi morao ponoviti cijelu transakciju (uključujući audit), a dva paralelna
„replace" zahtjeva bi i dalje mogla završiti u nedeterminističnom pobjedniku. Lock daje determinističko „posljednji
koji je dobio lock je fallback" i jedan `P2002` put ostaje samo kao defanzivna grana (`FALLBACK_CONFLICT`, 409).

## Implementacija

### 1. Migracija `20271202130000_group_fallback_cardinality`

Nedestruktivna (nema `DROP`/`TRUNCATE`/`ALTER … DROP`, pa ne treba approval u `ops/migrations/destructive-approvals.json`):

1. **Dedupe** postojećih podataka: u svakom OU-u ostaje fallback grupa sa najstarijim `createdAt` (tie-break `id`) —
   ista grupa koju bi install seed izabrao — ostalima se `isFallback` postavlja na `false`. Upit je deterministički, pa
   je ponovno pokretanje na popravljenoj bazi no-op.
2. **Parcijalni unique index** `Group_fallback_per_organizational_unit_key`.

`schema/identity.prisma` nosi `///` komentar na `isFallback` koji upućuje na index (Prisma ga ne može izraziti u šemi;
dodavanje `@@index` bi bilo u kontradikciji) i sentinel `expectedSchemaMigration` je pomjeren na novu migraciju.

**Rollback:** `DROP INDEX "Group_fallback_per_organizational_unit_key"` vraća staro (slabije) stanje. Dedupe **nije**
reverzibilan — koja je grupa izgubila oznaku vidi se u `AuditLog`-u samo ako je promjena prošla kroz servis; migracija
sama ne piše audit. To je namjerno: migracija popravlja neispravno stanje, ne poslovnu odluku.

### 2. `with-group-fallback-lock.ts`

```ts
await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`group-fallback:${organizationalUnitId}`}))`;
```

Ključ je izvezen (`fallbackLockKey`) da ga test i operator u `pg_locks` mogu prepoznati.

### 3. `assert-fallback-removal-allowed.ts`

`count({ organizationalUnitId, isFallback: true, id: { not: groupId } })`; ako je `0` → `LAST_FALLBACK_GROUP` sa
`details.organizationalUnitId`. Poziva se **samo** pod lockom, i to samo kad se oznaka gasi.

### 4. `create-group.ts`, `update-group.ts`, `delete-group.ts`

- `create` uzima lock **samo** kad `isFallback` (običan create nije fallback write) i zadržava postojeće replace
  ponašanje (prethodni fallback se oslobađa + audit `fallback_reassigned`).
- `update` uzima lock **samo** kad se `isFallback` mijenja; gašenje prvo prolazi guard. Rename/CAB/problem flagovi ostaju
  bez locka (i dalje su `-05`, vidi granicu).
- `delete` uzima isti lock prije inventara iz W2.12 — brojanje fallbacka i brisanje su sada jedan serijalizovan akt.

### 5. Install seed

`ensure-install-fallback-group.ts` označava fallback grupu (i ponekad je **premješta** u drugi OU) pod istim lockom i
prvo oslobađa fallback ciljnog OU-a. Bez toga bi seed na bazi sa novim indexom pao sa `P2002`. In-memory seed klijent je
dobio `count` i `updateMany` da bi to mogao i dokazati.

### 6. Error contract i frontend

`LAST_FALLBACK_GROUP` i `FALLBACK_CONFLICT` su 409; tijelo nosi `code`, `message` i (za prvi) `organizationalUnitId`.
`GroupsError` dobija `details` koji se spread-uju u tijelo. Frontend mapira `LAST_FALLBACK_GROUP` na postojeći
`groups.errorSoleFallback` (tekst proširen: „postavite drugu grupu prije brisanja **ili isključivanja oznake**") i
`FALLBACK_CONFLICT` na novi `groups.errorFallbackConflict`; oba su u `bs` i `en`.

## Matrica ishoda

| Radnja | Stanje | Rezultat |
| --- | --- | --- |
| `PATCH isFallback=false` | grupa je jedini fallback OU-a | **409** `LAST_FALLBACK_GROUP`, stanje nepromijenjeno |
| `PATCH isFallback=false` | nije fallback | 200, bez locka (nije toggle) |
| `PATCH isFallback=true` | druga grupa je fallback | 200; stara oslobođena + audit `fallback_reassigned`; tačno jedna |
| `PATCH isFallback=true` | grupa je već fallback | 200, bez locka (no-op za invarijantu) |
| `POST` sa `isFallback=true` | OU već ima fallback | 200; stara oslobođena; tačno jedna |
| `POST` bez oznake | bilo koje | 200, bez locka |
| `DELETE` jedinog fallbacka | OU | **409** (W2.12 `HAS_DEPENDENCIES`, kind `fallbackGroups`) |
| Insert/update koji bi napravio drugi fallback (mimo servisa) | OU | **`P2002`** na `Group_fallback_per_organizational_unit_key` |
| Install seed u OU koji već ima fallback | OU | seed oslobađa stari, postavlja svoj; tačno jedna |

## Vizuelna provjera (ručni koraci)

Potrebno: seedovani manualni katalog (`npm run db:seed` → `/Users`, `/Users/IT`, `/Groups`) i najmanje tri grupe u
`/Users/IT`. Za korak 8 dvije instance istog imagea i iste baze.

1. **Priprema.** Administracija → **Grupe** → `/Users/IT`: grupa `IT Support` je fallback (značka na kartici), `Grupa A`
   i `Grupa B` nisu.
2. **Zaštita posljednjeg fallbacka.** Otvori `IT Support` → **Uredi** → isključi **Fallback grupa** → **Sačuvaj**.
   Očekivano: crvena poruka „Ovo je jedina fallback grupa organizacione jedinice…", oznaka ostaje uključena, kartica i
   dalje pokazuje fallback. U Network tabu: **409** sa `code: "LAST_FALLBACK_GROUP"` i `organizationalUnitId`.
3. **Zamjena jednim potezom.** Otvori `Grupa A` → **Uredi** → uključi **Fallback grupa** → **Sačuvaj**. Očekivano:
   `Grupa A` dobija značku, `IT Support` je gubi — **nijedan trenutak** u kojem obje imaju značku. Lista se osvježi.
4. **Atomičnost u UI.** Ponovi korak 3 ali sa `Grupa B` → obje promjene (gašenje stare + paljenje nove) vide se kao
   jedan refresh; nema međustanja „nijedna nije fallback". Ako vidiš prazninu, osvježi stranicu — u bazi mora biti tačno
   jedna (korak 7).
5. **Audit imenuje oslobođenu grupu.** Administracija → **Audit log** → `group.updated`, entitet `Grupa A` (ona koja je
   izgubila oznaku): metadata ima `reason: "fallback_reassigned"`, `before.isFallback = true`,
   `after.isFallback = false`. Za novu fallback grupu postoji normalan `group.updated` sa `isFallback: true`.
6. **Brisanje jedinog fallbacka.** Označi `Grupa B` kao fallback, pa je pokušaj **Obrisati**. Dijalog iz W2.12 pokazuje
   „Brisanje je blokirano — jedina fallback grupa OU-a" i potvrda je disablirana; u Network tabu 409 sa
   `blockers: [{ kind: "fallbackGroups", count: 1 }]`.
7. **Provjera u bazi (obavezno).** `SELECT "organizationalUnitId", count(*) FROM "Group" WHERE "isFallback" GROUP BY 1;`
   → svaki red ima **tačno 1**. Zatim probaj namjerno napraviti duplikat:
   `INSERT`/`UPDATE` kojim bi druga grupa u istom OU-u dobila `isFallback = true` → baza odbija sa
   `duplicate key value violates unique constraint "Group_fallback_per_organizational_unit_key"`. To je dokaz da zaštita
   ne visi samo o aplikaciji.
8. **Dvije instance.** Na instanci **1** otvori `Uredi` na `Grupa A` (ne mijenjaj ništa). Na instanci **2** postavi
   `Grupa B` kao fallback i sačuvaj. Na instanci **1** sačuvaj uključenu oznaku za `Grupa A` → mora uspjeti i ostaviti
   **tačno jednu** fallback grupu (lock je u bazi, ne u procesu); u bazi `count(*) = 1`.
9. **Rename ne dira fallback.** Preimenuj `Grupa B` u `Grupa B2` → oznaka fallbacka ostaje, nema 409, nema dodatnog
   audita `fallback_reassigned`.

## AD konektor sa testnim OU

Paket ne dira directory konektor. Dovoljan je **manualni katalog** (`npm run db:seed` u `backend`) sa `/Users`,
`/Users/IT`, `/Groups` — sve grupe za korake 1–9 prave se kroz UI u `/Users/IT`. Ako koristiš realan LDAPS setup iz
`341-w210-users-control-plane-scope.md`, sekcija „AD konektor sa testnim OU" (dijelovi A i B), bitno je da `/Users/IT` i
`/Groups` postoje kao **odvojene grane**: fallback invarijanta je po OU-u, pa grupa u `/Groups` smije biti fallback svog
OU-a nezavisno od `/Users/IT` (korak 7 to pokazuje kao dva reda sa po jednim fallbackom). Scoped ADMIN iz `/Users/IT`
mora dobiti **403** kad kroz `PATCH`/`POST` pokuša mijenjati fallback oznaku grupe u `/Groups` — scope se provjerava
prije locka.

## Direktni testni dokaz

`groups/fallback-cardinality.spec.ts` (8) — fixture je in-memory tabela koja **implementira i index i lock**, pa prekršaj
pada glasno umjesto da prođe tiho:

- `PATCH isFallback=false` na jedinom fallbacku → `LAST_FALLBACK_GROUP` sa `details`, stanje nepromijenjeno, **nema**
  audita;
- zamjena: stara oslobođena, nova postavljena, tačno jedna, audit `fallback_reassigned` nosi `entityId` stare grupe;
- lock se uzima **samo** na toggle (rename i `isFallback=true` na već fallback → nula `$executeRaw`);
- ključ locka je `group-fallback:<ouId>` (ne globalni);
- create sa oznakom = replace; create bez oznake ne uzima lock;
- **20 paralelnih zamjena** → svih 20 uspijeva (lock čeka, index se ne aktivira), tačno jedna fallback grupa, 19 lockova;
- **2 × 10 paralelnih zamjena** na dva OU-a → svaki OU ima tačno jednu, bez ukrštanja.

`groups/fallback-cardinality.integration.spec.ts` (6, **real PostgreSQL**, registrovan u `run-isolated-integration.mjs`)
— dokazuje supstrat, bez servisa i bez audit tabela:

- parcijalni index **postoji** (`pg_indexes`, `UNIQUE`, predikat `isFallback`);
- drugi fallback u istom OU-u → **`P2002`** na nivou baze;
- 20 paralelnih `replaceFallback` (lock + release + claim) → tačno jedna;
- dva OU-a po 10 paralelnih zamjena → po jedna u svakom;
- guard pod lockom odbija gašenje posljednjeg fallbacka (`LAST_FALLBACK_GROUP`) i stanje ostaje;
- delete fallbacka **paralelno** sa zamjenom → nikad nula fallbacka.

`install` **54 suite / 277 testova** prolazi sa novim `count`/`updateMany` u seed klijentu (dokaz da seed i dalje radi
idempotentno i pod novim indexom). `common/database` **14 suite** (sentinel pomjeren).

## Lokalna verifikacija i njeno ograničenje

- backend `src/modules/groups` + `src/common/database`: **14 suite / 85 testova** (1 suite skipped: integracija bez baze);
- backend `src/modules/install`: **54 suite / 277 testova**;
- `check-migration-policy` ✓ (**127** migracija, sentinel pokazuje na novu, nema destruktivnog SQL-a);
- `wiring:check` ✓ (**633** rute nepromijenjene), `run-isolated-integration.test` ✓ (**23** provjere, uključujući novi
  obavezni shard), backend eslint ✓ (groups + install + database);
- frontend: `tsc -b` ✓, `vitest` (i18n + groups) **55 testova** ✓, eslint ✓, prettier ✓;
- **nije izvedeno lokalno:** `prisma generate`/`validate` (traži `binaries.prisma.sh`) → lokalni Jest je pokrenut sa
  isključenom TS dijagnostikom (stub klijenta bez delegata); type-check protiv pravog klijenta i **primjena migracije**
  daju CI (`Validate the complete Prisma schema`, `Backend PostgreSQL + Redis integration`);
- **nije izvedeno lokalno:** novi integracioni spec nije izvršen (nema PostgreSQL-a u sandboxu) — piše se kao
  `describe.skip` bez `PRIVACY_IT_DATABASE_URL`, dakle **skipped ≠ passed**; prvi realan dokaz je CI integracioni job.

## Granica paketa

- **`BA-groups-05`** (CAB/problem oznake bez lifecycle provjere) **ostaje otvoren** — ovaj paket pokriva samo `isFallback`.
- **`BA-groups-06`** (konkurentni key/member konflikti) **ostaje otvoren**; `FALLBACK_CONFLICT` pokriva samo `P2002` na
  fallback indexu, ne na `Group.key`.
- **`BA-groups-07`** (TOCTOU prema `SetNull`) **ostaje otvoren**; lock sada pokriva fallback-inventar u deleteu, ne
  ticket assignment.
- **`BA-groups-02`**, **`-08`**, **`-09`**, **`-10`** nisu dirani.
- **Install seed oslobađa stari fallback ciljnog OU-a bez `fallback_reassigned` audita** — install putanja ima vlastiti
  audit (`install.seeded`) i ne piše per-group zapise; to je postojeće ponašanje install modula, ne regresija, ali je
  razlika u odnosu na admin put i ovdje je zapisana.
- **Nema posebnog endpointa `POST /groups/:id/replace-fallback`**: `PATCH { isFallback: true }` je taj command; novi
  endpoint bi duplirao ugovor bez nove garancije.
- **Dedupe u migraciji ne piše audit** (vidi §1) — historija koja grupa je izgubila oznaku postoji samo ako je promjena
  išla kroz servis.
- **Perf budžet `db_queries_per_request` je u crvenom od W2.11** (jedan `SELECT` na singleton reviziju OU kataloga po
  zahtjevu). To je posljedica prethodnog paketa i traži izmjenu OU scope keša (npr. spajanje revizije sa postojećim
  čitanjem), ne izmjenu grupa; ostaje otvoreno i nije prikazano kao zeleno.
- **Fallback grupa danas ne učestvuje direktno u ticket routingu** (routing koristi
  `privateTicketUnroutedQueueTargetGroupId` postavku; fallback grupa je ono što install seed u tu postavku upiše).
  Invarijanta je zato preduvjet determinizma seeda i admin prikaza, ne nova routing logika — to je u audit `-03`
  („routing fixture bira deterministički rezultat") ispunjeno time što skup od najviše jednog elementa nema izbora.

## CI

Run [`45558147870`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45558147870) na `378f1c1` — **success**:

- **Backend build + test** ✓ (schema + generisani klijent, `nest build`, full Jest sa novim unit fixture-om i
  registrovanim integracionim shardom, eslint, wiring check sa **633** rute);
- **Backend PostgreSQL + Redis integration** ✓ — **migracija `20271202130000_group_fallback_cardinality` je primijenjena
  na stvarnu bazu**, parcijalni index postoji, a novi `fallback-cardinality.integration.spec.ts` (6) je izvršen:
  `P2002` na drugi fallback, 20 paralelnih zamjena ostavlja tačno jednu, delete-vs-replace trka nikad ne ostavlja nulu;
- **Frontend build + test** ✓ (tsc, eslint, prettier, vitest sa i18n parity/identical čuvarima, bundle budget);
- **Docs guard** ✓ (uključuje `audit:traceability` i `check-docs-content`);
- **Backend container + supply chain** ✓;
- **Skipped:** *Read-only service-form pattern inventory*, *E2E install wizard*, *E2E critical flows* (`skipped` nije
  `passed`; browser E2E iz „Vizuelna provjera" nije izveden).

**Neuspjeli pokušaj:** prvi run [`45557049318`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45557049318)
na `4344b36` pao je na **vlastitoj grešci** — `TS2353` u `groups.service.spec.ts` (fake klijent nije u tipu imao novi
`$executeRaw`); popravka `378f1c1` (dodan `$executeRaw: jest.Mock` u tip) dala je zeleni run. Isti obrazac kao W2.11:
`nest build` pokreće i integration i container job, pa jedna tip-greška ruši tri joba.

**Odvojeni Perf smoke je crven, i to nije ovaj paket.** [`45557049338`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45557049338)
pada na `db_queries_per_request = 2,592` prema budžetu `2,1`, sa `SELECT:OrganizationalUnitCatalogRevision` vidljivim u
trace-u **svakog** zahtjeva. Historija istog workflowa pokazuje da je zadnji zeleni run `45496189459` na `6d8f33c`
(W2.10), a prvi crveni `45507674274` na `ca75ac7` (W2.11) — dakle regresiju je uveo **W2.11**, ne W2.13: ovaj paket
dodaje `pg_advisory_xact_lock` samo na write putanju fallbacka, bez ijednog dodatnog upita na read stazama koje perf
mjeri (`/tickets`, `/tickets/inbox`, `/services`). Ne tvrdim da je crveni perf gate zelen; zapisujem ga kao **otvoren
follow-up** (vidi „Granica paketa") jer ga treba rješavati u OU scope kešu, ne u grupama.

## Registar nalaza

- Zatvoreno: `BA-groups-03`.
- Ostaje otvoreno iz istog modula: `-02`, `-04`, `-05`, `-06`, `-07`, `-08`, `-09`, `-10`.
