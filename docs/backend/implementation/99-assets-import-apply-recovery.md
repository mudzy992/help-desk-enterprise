# Zatvaranje paketa — W7.13

**Paket:** W7.13 — import apply lease, recovery i idempotency<br>
**Nalaz:** `BA-assets-13` (P2) — zatvoren<br>
**Kodni commit:** `f6c41bfe75c3c628f763bdfd8320d950d3746802`<br>
**Finalni testani kodni SHA:** `f6c41bfe75c3c628f763bdfd8320d950d3746802`<br>
**Kod CI:** [`41036970834`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41036970834) — zelen na finalnom kodnom SHA<br>
**Closeout/traceability CI:** [`41038313696`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41038313696) — zelen na closeout SHA `b68faa9d934dfc981a578cb3cd7392999b83523d`<br>
**DB migracija:** `20271030100000_asset_import_apply_lease` — aditivna state/lease/checkpoint polja i constraints

## Nalaz i acceptance

Prije W7.13 apply claim je koristio `updateMany` sa `status=PREVIEW`, ali je mijenjao samo `expiresAt` na trenutno vrijeme. Job nije trajno prešao u `APPLYING`, nije imao lease owner token niti durable batch cursor. Pošto je status ostajao `PREVIEW`, dva konkurentna apply zahtjeva mogla su oba proći claim. Crash nakon jednog ili više commitovanih batch-eva mogao je ostaviti promijenjene assete/evente bez trajnog rezultata koji bi pokazao gdje sigurno nastaviti. All-or-nothing asset writes i terminalni job status također nisu bili u jednoj transakciji.

Acceptance je ograničen na `BA-assets-13`: eksplicitno `APPLYING` stanje; lease takeover samo nakon isteka; fencing starog workera; durable, atomarni checkpoint i safe resume/reconcile; bez dupliranja već commitovanih DB efekata; discard mora izgubiti race protiv apply claim-a; all-or-nothing ne smije ostaviti parcijalne business writes; frontend mora prikazati stanje i omogućiti autorizovani recovery. Nisu zatvoreni drugi assets nalazi.

## Implementacija

- PostgreSQL atomarni CAS claim mijenja `PREVIEW -> APPLYING`, postavlja UUID `applyRunToken`, petominutni `applyLeaseUntil` i uvećava `applyAttempts`. Preview `expiresAt` ostaje nepromijenjen. Drugi aktivni caller dobija HTTP 409 (`ASSET_IMPORT_APPLYING`); expired lease se može preuzeti novim UUID tokenom.
- Svaki batch renewa lease samo ako su job status i token još aktuelni. Asset writes, asset-event writes i progress checkpoint se commit-uju u istoj transakciji. Checkpoint sadrži row cursor, cumulative create/update/failure counts i row failures; batch je najviše 500 planiranih redova. Cursor je idempotency granica: već commitovan batch se ne izvršava ponovo nakon izgubljenog odgovora ili crasha. Ako je batch transakcija rollbackovana i greška se može zabilježiti, njegov neprimijenjeni skup se trajno checkpointuje kao failed umjesto da se ponavlja bez kraja.
- Recovery ponovo čita durable cursor, dodjeljuje novi token nakon isteka leasea i nastavlja iza potvrđenih batch-eva. Bilo koji nastavak starog run tokena je odbijen prije asset writes/finalizacije. Ako je posljednji checkpoint commitovan, ali terminalni status nije, retry vidi cursor na kraju i dovršava terminalnu reconciliaciju bez ponovnog izvršavanja business writes.
- `allOrNothing` ne koristi partial checkpoint. Scope se revalidira; asset/event writes i uspješni terminalni `APPLIED` zapis su u istoj transakciji sa timeoutom od 180 sekundi. Ako primjena ne uspije, ta transakcija rollbackuje sve asset/event writes; zatim token-fenced job update zabilježi `FAILED` i greške. Time rollback poslovnih efekata i terminalna failure evidencija imaju eksplicitnu semantiku.
- `discard` sada koristi `status=PREVIEW` CAS. APPLYING se ne može odbaciti i vraća HTTP 409. `APPLYING` status i lease timestamp izloženi su u history odgovoru; frontend ga prikazuje, polluje history svakih 15 sekundi dok postoji aktivni apply i prikazuje `Nastavi uvoz` samo po isteku leasea. Resume koristi isti apply endpoint; autorizacija i dalje provjerava vlasnika/scope joba.
- `AssetImportStatus` dobija `APPLYING`; `AssetImportJob` dobija nullable UUID `applyRunToken`, nullable `applyLeaseUntil`, nullable JSON `applyProgress` i `applyAttempts` sa defaultom nula. DB checks zahtijevaju nenegativne attempts te, za `APPLYING`, token/lease/rows/pozitivni attempts; izvan `APPLYING` token, lease i progress moraju biti null. Runtime migration sentinel je pomjeren na novu migraciju.
- Preview expiry i apply lease su odvojene stvari. Stari jobovi koji su ostali `PREVIEW` sa isteklim `expiresAt` nemaju pouzdan istorijski cursor/results i zato se označavaju `EXPIRED`; nema backfill-a niti automatskog replaya. Stanje ranije commitovanih asseta treba pregledati kroz `AssetEvent.detail.jobId` prije bilo kakve ručne ponovne obrade.

W7.13 ne uvodi HTTP request idempotency-key protokol niti exactly-once garanciju za best-effort audit/transport izvan DB transakcije. Ovim se sprečava dupliranje DB business efekata unutar trajnog apply checkpoint ugovora; već terminalni job se ne primjenjuje ponovo. Import privacy/retention, audit/health metrike, širi import error retry UX i maksimalni workbook memory profil ostaju izvan ovog nalaza. Posebno `BA-assets-18` ostaje otvoren.

## Direktni acceptance i testni dokaz

`backend/src/modules/assets/asset-import-apply.integration.spec.ts` je registrovan u `backend/scripts/run-isolated-integration.mjs` i pokriva stvarni PostgreSQL:

1. konkurentni apply claim: tačno jedan aktivni vlasnik; drugi zahtjev i discard dobijaju `importApplying`; preview TTL nije promijenjen;
2. stale lease takeover: novi attempt dobija svjež UUID token, a stari runner je odbijen prije writes;
3. recovery nakon već commitovanog batcha: apply nastavlja od cursor-a bez dupliranja prvog reda;
4. recovery nakon posljednjeg checkpointa i prije terminalnog finaliziranja;
5. all-or-nothing stale-version greška: novi asset write se rollbackuje, postojeći asset ostaje nepromijenjen, a job se u stanju `FAILED` finalizira.

`backend/src/modules/assets/assets-version.dto.spec.ts` provjerava HTTP 409 mapiranje za aktivni import lease; `backend/src/common/database/database-runtime-contract.spec.ts` zaključava novi schema sentinel. Isolated runner contract test potvrđuje da se acceptance suite izvršava u CI harnessu.

Lokalne provjere na kodnom SHA:

- ciljano backend ESLint za service, acceptance spec, DTO/error mapping i isolated runner — prošao;
- ciljani backend Jest: 2 suite-a / 6 testova — prošao;
- backend `audit:traceability:test` prije docs closeouta: 8/8; `test:integration-harness`: 3/3;
- migration policy: 100 migracija, destructive approval hashes važeći; policy testovi 2/2;
- frontend lint, Prettier, i18n check i build — prošli; puni frontend Vitest: 427 fajlova / 1.656 testova prošlo;
- `git diff --check` — čist.

Sandbox nije mogao lokalno generisati Prisma client zbog TLS pristupa `binaries.prisma.sh`; lokalni `DATABASE_URL` nije bio postavljen, pa ciljna migracijska historija nije lokalno provjerena. Ovo nisu prikazani kao zeleni lokalni backend build ili lokalni PostgreSQL acceptance. CI je obezbijedio puni generated-client/build/Jest i stvarni PostgreSQL dokaz.

## Commit, CI i testni dokaz

Kodna promjena i migracija na SHA `f6c41bfe75c3c628f763bdfd8320d950d3746802` prošle su CI [`41036970834`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41036970834):

- **Backend:** Prisma schema validate/generate, generated artifact i wiring provjere, build, lint, testovi i CI gate — zeleni.
- **PostgreSQL/Redis:** single-owner release migrator replayovao je svih 100 migracija; migration history je potvrđena kao aktuelna; dependency/isolation provjere i real PostgreSQL integracijski job su zeleni, uključujući suite registrovan za W7.13.
- **Frontend:** lint, format, Vitest, build i bundle/cold-route provjere — zeleni.
- **Docs/container/supply-chain:** docs guard, container contract/model, image build, SBOM, skenovi/provenance i ukupni CI gate — zeleni.
- **Preskočeno po push triggeru:** `E2E critical flows` i `E2E install wizard`. Image `Enforce zero high/critical vulnerabilities` korak je `skipped`, a ne pao; workflow nije imao actionable high/critical nalaz za enforcement.
- **Neuspjeli CI pokušaji:** nema.
- Nakon sinhronizacije izvornog audita, findings registra, machine-readable plana i master plana, closeout/traceability CI [`41038313696`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41038313696) je zelen na SHA `b68faa9d934dfc981a578cb3cd7392999b83523d`. Prošao je audit baseline/traceability test, Prisma/backend i PostgreSQL/Redis gate, frontend, docs guard, container/supply-chain i CI gate; E2E push poslovi su preskočeni, a image vulnerability enforcement je `skipped` po uslovu bez actionable nalaza.

## Registar nalaza

- Zatvoren je samo `BA-assets-13` (P2); `BA-assets-12` ostaje ranije zatvoren.
- `BA-assets-14`–`BA-assets-19` ostaju otvoreni, uključujući transfer snapshot/binary retention (`BA-assets-14`) i health/metrics (`BA-assets-18`).
- Deklarisani zbir nakon W7.13: **576 otvorenih / 116 zatvorenih / 692 ukupno**. Machine-readable source statusi: **579 otvorenih / 102 zatvorena / 11 historijskih**; preegzistentna razlika od tri statusa ostaje izvan scopea.
- Baseline audit ocjena **4,59/10** ostaje početni snapshot.

## Migracija, preflight, rollout i rollback

Migracija `20271030100000_asset_import_apply_lease` je transakcijska i aditivna; nema destruktivnog SQL-a, data rewrite/backfill-a niti promjene postojećih rows/errors. CI je disposable PostgreSQL-u replayovao svih 100 migracija i potvrdio migration history. To nije production apply. Nema lokalne target DB konekcije u ovom sandboxu; korisnička potvrda da su ranije migracije uredne ne zamjenjuje runtime provjeru historije na ciljnoj bazi.

**Preflight i rollout:**

1. Prije release migratora sačuvati standardni backup/snapshot i potvrditi da je prethodna migracija `20271028100000_asset_reminder_extra_email_delivery` uspješno primijenjena, bez failed/inconsistent Prisma migracija. Ne ponavljati nijednu ranije uspješnu migraciju.
2. Prije primjene nove šeme drain-ovati stare API/worker instance koje mogu primjenjivati imports. Stari kod ne poznaje `APPLYING`/run-token ugovor; nemojte ostaviti stare writers aktivne tokom prelaza.
3. Inventarisati legacy candidate jobs (`status=PREVIEW` i `expiresAt <= now`) i sačuvati njihove ID-eve prije cleanup-a. Njihov stari `expiresAt` može biti rezultat claim-a, ali ne dokazuje koliko writes je commitovano; ne replayati ih automatski. Po potrebi uskladiti `AssetEvent.detail->>'jobId'` i trenutno stanje asseta uz operator review.
4. Kroz postojeći single-owner `npm run db:migrate:release` primijeniti novu pending migraciju. Nakon toga potvrditi da migration history pokazuje `20271030100000_asset_import_apply_lease` kao završenu i da nove kolone/checks postoje. Tek zatim podići novu aplikacijsku verziju koja očekuje ovaj schema sentinel.
5. Pratiti `APPLYING` jobs kroz import history. UI resume postaje dostupan nakon petominutnog lease roka; prije ručnog retryja provjeriti da stari proces više nije živ. `BA-assets-18` observability/health metrike ostaju otvorene i nisu dio ovog closeouta.

**Rollback i forward recovery:** migracija ne briše ni prepisuje poslovne podatke. Ako migracija ne uspije, prvo provjeriti stvarno stanje; zbog PostgreSQL transakcije neuspjeli DDL se rollbackuje. `prisma migrate resolve --rolled-back 20271030100000_asset_import_apply_lease` je samo za potvrđeni neuspjeli/pending pokušaj nakon pregleda stanja, nikad za uspješno primijenjenu migraciju. Ako se uspješna migracija kasnije mora promijeniti ili ukloniti, koristiti zasebnu reviewed forward-only migraciju — ne ručno dropovati kolone/enum vrijednost niti ponavljati staru migraciju.

Stari application build ne smije se vratiti dok postoje `APPLYING` jobovi ili dok legacy partial imports nisu reconciled: on nema fencing/resume kod i može ostaviti jobove zaglavu. Preferirati forward fix. Ako rollback aplikacije postane nužan prije novih writes, prvo pauzirati imports, dovršiti ili operativno uskladiti sve `APPLYING` jobs i sačuvati novu aditivnu šemu; nema automatskog rollback SQL-a.

## Sljedeći paket

Naredni paket nije započet. W7.14 nije odobren; `BA-assets-14`–`BA-assets-19` ostaju otvoreni dok korisnik zasebno ne odobri sljedeći scope.