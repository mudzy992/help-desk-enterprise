# Package closeout — W7.18

**Paket:** W7.18 — asset workflow operativne metrike i integritet transfer datoteka<br>
**Nalaz:** `BA-assets-18` (P3) — zatvoren uz zeleni finalni kodni CI; `BA-assets-16` i `BA-assets-19` ostaju otvoreni/izvan ovog scopea<br>
**Kodni commit:** `e45547403786beef317ad3a55304a6e47e561085` (feature); follow-up commitovi `8db2feaa31b68111295c01b1e6fb124460f266b4` (i18n klasifikacija), `f17af8dbd4bef31b6391a8c744d6055a58a6b9b5` (rolling API kompatibilnost) i `aae99fc8cf08422a7413ad8d60f6e8a1f5e5f84b` (real-Redis acceptance)<br>
**Finalni testani SHA:** `aae99fc8cf08422a7413ad8d60f6e8a1f5e5f84b`<br>
**CI:** [`41255976886`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41255976886) — zelen na finalnom testanom SHA<br>
**PR:** nije otvoren; nije bilo zasebne PR autorizacije<br>
**DB migracije:** nema

## Nalaz i acceptance

`BA-assets-18` je tražio koherentan ops-health signal za zaglavljene asset importe, reminder dostavu, prealokaciju licenci, transfer purge i file mismatch, directory-sync overlap i neuspjele asset audit upise. W7.18 zatvara **samo** ovaj P3 nalaz. W7.17 (`BA-assets-17`) ostaje historijski zatvoren; W7.16 (`BA-assets-16`), `BA-assets-19` i ostali susjedni nalazi nisu dio scopea i njihov status se ovim closeoutom ne mijenja.

- `APPLYING` import se smatra zaglavljenim kad je `applyLeaseUntil` istekao prije više od 10 minuta.
- Reminder metrike obuhvataju `FAILED` isporuke i `CLAIMED` zapise starije od 10 minuta.
- Signed-file purge signal prikazuje aktivne i stale zahtjeve, te starost najstarijeg zahtjeva. Prag od 30 minuta pokriva dva privacy-maintenance retry ciklusa od po 15 minuta.
- Licencna agregacija prikazuje broj prekoračenih licenci i seats; ponovo koristi postojeće `loadAssetReportData()` / `overAllocatedLicenses()` ponašanje.
- Directory-sync overlap i neuspjeli audit upisi su cross-process Redis metrike; prealokacija i overlap su vidljivi podaci, **ne alerti sami po sebi**.
- `assets/transfers` sken je read-only, bounded, unutar postojećeg upload-roota i nikad ne briše datoteke. Neuspješan/nepotpun sken i nedostupni Redis daju unknown/null, nikad lažno nulu.
- W7.10 je već dodao scheduler-presence i last-success provjere; W7.18 ih **ne duplicira**.

## Implementacija

- `AssetOperationsMetricStore` koristi fiksne ključeve oblika `assets:ops:<event>:<minute>`, Lua `INCR`/`EXPIRE`, 70-minutni TTL i zbir prethodnih 60 kompletnih minuta (trenutna nepotpuna minuta se izostavlja). Event nazivi su ograničeni na overlap i audit failure; ključevi ne sadrže user, recipient, asset ni file ID. Best-effort Redis write ima 250 ms granicu.
- Directory sync broji i lokalni `running` konflikt i neuspjeli pokušaj preuzimanja zauzetog distribuiranog leasea. Brojač je samo vidljivost, bez vlastitog alarma.
- `recordAssetAuditEntry()` broji neuspjeli audit write prije ponovnog bacanja originalne greške. To pokriva i `withAssetAuditTransaction()` i standalone/best-effort audit putanje. Pad Redis metričkog upisa ne zamjenjuje originalni audit exception; transactional business/audit pokušaj i dalje rollbackuje.
- Collector kombinuje trajne DB redove s Redis bucketima. Licencni podaci dolaze iz postojeće report-pack agregacije, bez dupliranja logike. Najstariji purge zahtjev se čita sortirano uzlazno po `signedFilePurgeRequestedAt`; starost je floored u minute, clamped na nulu, a odsustvo zahtjeva je `null`.
- `inspectAssetTransferFiles()` skenira samo `assets/transfers`, maksimalno 20.000 DB referenci i 20.000 entries, do dubine četiri. Upload root se kanonikalizuje, `assets` i sam `assets/transfers` moraju biti stvarni direktoriji, a symlinkovi/specijalni entries se ne prate. Limit, invalid/out-of-root reference, nedostajući root ili I/O greška vraćaju `limited`/`unavailable` sa null brojevima. Nema write/delete poziva.
- Sken se kešira 15 minuta uz in-flight deduplikaciju. DB/file subprobei ostaju bounded na 3 s, a ukupni asset-operations probe na 6 s; kvar ne prekida ostatak ops-health kruga.
- Alerti su ograničeni na zaglavljene importe, failed/stale remindere, stare purge zahtjeve ili mismatch nakon **potpunog** skena, te audit-write greške. Audit failure je WARNING za 1–4 u satu i CRITICAL od 5/sat; catalog hysteresis je dvije uzastopne probe za otvaranje i zatvaranje. Incomplete scan i unknown Redis metrike ne pale lažne nula/mismatch alarme.
- Admin ops-health kartica, alert detalji, bs/en poruke i `ops/runbook/ALERTS.md` prikazuju nove metrike. API polje `assetOperations` je aditivno i nullable; frontend tip ga tretira kao optional tokom rolling deploya, a UI prikazuje unavailable ako ga stariji API payload izostavi.

**Van scopea:** scheduler registration/last-success (W7.10), automatsko brisanje/orphan cleanup, schema/migracija, BA-assets-16 pagination/CI gate, BA-assets-19 i šira privacy/lifecycle izmjena.

## Direktni testni dokaz

- `backend/src/modules/assets/asset-operations-metrics.spec.ts` — fixed-minute key/TTL, zbir prethodnih 60 kompletnih minuta, isključenje tekuće minute i fail-closed obrada neispravnih Redis vrijednosti.
- `backend/src/modules/assets/asset-operations-metrics.integration.spec.ts` — dvije nezavisne Redis konekcije rade paralelne audit/overlap incrementove; drugi klijent vidi zajedničko stanje, TTL ostaje pozitivan i najviše 70 minuta, a last-hour read vrati tačne zbirove. Suite je registrovan u `backend/scripts/run-isolated-integration.mjs`; harness test provjerava članstvo.
- `backend/src/modules/assets/asset-audit-transaction.spec.ts` — audit koristi aktivnu business transakciju; neuspjeh se broji prije rollbacka; Redis metrički failure ne zamjenjuje originalnu audit grešku; standalone best-effort putanja također broji failure.
- `backend/src/modules/assets/transfers/asset-transfer-file-integrity.spec.ts` — orphan/missing poređenje i provjera da se ništa ne briše; nepostojeći root, symlink samog transfer-roota, symlink entry, entry-limit exhaustion i out-of-root referenca daju nepotpun/unknown rezultat.
- `backend/src/modules/ops-health/collect-asset-operations-signal.spec.ts` — DB brojači, najstarija purge starost, postojeća licence agregacija i unknown/null za Redis ili nepotpun file scan.
- `backend/src/modules/ops-health/evaluate-ops-signals.spec.ts` — warning/critical pragovi, incomplete scan bez lažnog alerta, te eksplicitna provjera da overlap i over-allocation sami ne aktiviraju alert.
- `frontend/src/components/admin/ops-health-metrics.spec.tsx` — prikaz unknown/incomplete podataka, nullable signal i stariji API payload bez `assetOperations` polja.
- `frontend/src/i18n/identical-translations.spec.ts` — namjerno zajednički placeholder `admin.opsHealth.assetOperations.countValue` je eksplicitno klasifikovan; očekivani broj identičnih ključeva je 187.

## CI i testni dokaz

CI run [`41255976886`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41255976886) na `aae99fc8cf08422a7413ad8d60f6e8a1f5e5f84b`:

- **Backend build + test:** passed — schema validation/Prisma generation, build, lint, compile safety-net, wiring/SLA provjere i puni Jest prolaz.
- **PostgreSQL/Redis integration:** passed, uključujući korak `Run real PostgreSQL integration suites`. Novi W7.18 Redis shard je u runner manifestu; CI integration job postavlja `REDIS_HOST=127.0.0.1`, pa je Redis acceptance `describe` aktivan. Runner izvršava svaki registrovani shard i vraća grešku na neuspjeh. GitHub raw log preuzimanje za suite-specific linije vratilo je `EOF`; zato ne navodim zaseban test-count iz loga, ali se uspješan integration runner/job i tačan registry/harness na testanom SHA-u mogu potvrditi.
- **Frontend build + test:** passed — lint, format, svi frontend testovi, TypeScript/Vite build i bundle/cold-route budžeti.
- **Docs guard:** CI korak je passed na testanom kodnom SHA-u (uključujući W7.18 runbook promjenu). Nakon dodavanja ovog closeouta i registry zapisa lokalno su prošli `node scripts/check-docs-content.mjs` i njegovih 9 guard testova; docs-only CI check nakon closeout commita se evidentira odvojeno.
- **Backend container + supply chain:** job passed; `Enforce zero high/critical image vulnerabilities` je `skipped` jer workflow uslov `steps.image-vulnerabilities.outputs.count != '0'` nije bio ispunjen.
- **E2E critical flows:** `skipped` prema dogovorenoj assets cadence politici; nije passed.
- **E2E install wizard:** `skipped` na push triggeru; nije passed.
- **Perf smoke:** nije pokrenut na pushu (workflow nema push trigger); ostaje za završetak assets segmenta.
- **CI gate:** passed.

**Neuspjeli pokušaj i korekcija:** CI [`41253138945`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41253138945) na početnom feature SHA-u `e45547403786beef317ad3a55304a6e47e561085` pao je na frontend `identical-translations.spec.ts`: `admin.opsHealth.assetOperations.countValue` imao je namjerno isti placeholder u bs/en, ali nije bio u eksplicitnom allowlistu. To je bila vlastita regresija test klasifikacije, ne preegzistentna greška. Commit `8db2feaa31b68111295c01b1e6fb124460f266b4` dodao je baš taj ključ i promijenio expected count 186→187; ciljano i puno lokalno frontend testiranje prošli su, a finalni CI na `aae99fc` je zelen. Neuspjeli run se ne prikazuje kao passed.

### Closeout/registar commit

Dokumentacijski i traceability commit `6e6c1eed27c85bf1a88714381aa77c6009a82a69` sadrži ovaj W7.18 closeout, assets audit update, deklarisani/machine-readable registry status i W7.18 traceability assertione. Njegov CI [`41257340005`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41257340005) na tom SHA-u je također zelen: backend build/full Jest, PostgreSQL+Redis integration, frontend lint/format/test/build/budgets, docs guard, container/supply-chain job i CI gate passed. E2E critical flows i install wizard su `skipped` na push triggeru; image high/critical enforcement je `skipped` jer count-uslov nije ispunjen; Perf smoke nije pokrenut na pushu.

### Dodatne lokalne provjere i ograničenja

- Lokalno: `npm test -- --runInBand --runTestsByPath src/modules/assets/asset-operations-metrics.spec.ts` — **1 suite / 3 testa prošla**.
- Lokalno: backend ESLint nad novim integration testom i runnerom, `node --test scripts/run-isolated-integration.test.mjs` — **3/3** harness testova prošla; lokalni Jest za `asset-operations-metrics.integration.spec.ts` je **skipped** jer sandbox nema `REDIS_HOST`/Redis servis. To nije prijavljeno kao local pass; real Redis shard je obuhvaćen CI integration jobom iznad.
- Lokalno: `npm test -- --run src/components/admin/ops-health-metrics.spec.tsx` — **3/3**; targeted ESLint, Prettier i `npx tsc -b --pretty false` prošli su. Nakon i18n allowlist korekcije puni frontend suite je prošao **428 fajlova / 1.658 testova**; finalni commit je dodatno verifikovan punim frontend CI suiteom.
- Lokalni backend kompletni Prisma-dependent build/suiteovi su bili blokirani nedostajućim generated Prisma clientom (`backend/src/generated/prisma/client`/`enums`); raniji engine download je bio blokiran sandbox TLS pristupom `binaries.prisma.sh`. Nema lokalnog assertion failurea za taj environment blocker. Finalni CI je uspješno generisao Prisma client i prošao backend build/full Jest.
- `git diff --check`, `node scripts/check-backend-findings.mjs` i 12 `scripts/check-backend-findings.test.mjs` provjera prošli su nakon registry/closeout izmjena.
- Nije korištena target DB i nije bilo migracije.

## Registar nalaza

- Zatvoren: samo `BA-assets-18` (P3), uz acceptance iznad i zeleni CI.
- Ostaju otvoreni: `BA-assets-16` (W7.16; njegov gate nije zelen), `BA-assets-19` i svi ostali izvan ovog paketa. `BA-assets-17` je ranije zatvoren u W7.17 i nije dio ovog closeouta.
- Deklarisani kontrolni zbir: **572 otvorena / 120 zatvorenih / 692 ukupno**; machine-readable source redovi: **575 otvorenih / 106 zatvorenih / 11 historijskih statusa**. Ranija razlika od tri statusa ostaje zasebna reconciliation obaveza; W7.18 je promijenio samo status `BA-assets-18`.
- Severity ukupno ostaje **P1=174 / P2=368 / P3=150**; P1/P2 stanje se ovim P3 paketom ne mijenja.

## Migracija, rollout i rollback

Nema Prisma schema promjene, DB migracije, backfill-a niti target-DB koraka; migracijski status nije mijenjan. CI migration replay je dio postojećeg disposable integration gatea i nije target deployment.

Rollout uključuje backend API/worker, frontend i runbook kao običan aplikacijski release. Zadržati postojeći shared Redis namespace i dostupnost upload-roota: Redis metrička greška se prikazuje kao unknown, a nedostupan/neispravan `assets/transfers` root kao unknown/limited; ništa se ne briše. `assetOperations` je nullable/additive, a novi UI podnosi i odsutnost polja tokom rolling deploya. Nema manual SQL-a ni operator-triggered cleanup koraka. Privacy maintenance ostaje na 15-minutnom rasporedu; stale purge threshold je 30 minuta.

Rollback je običan application rollback na prethodni backend/frontend artefact. Nema schema/data rollbacka ni ručnog file repaira; metrički Redis bucket-i ističu najkasnije za 70 minuta. Sken je read-only, pa rollback ne zahtijeva vraćanje ili rekonstrukciju fajlova.

## Sljedeći paket

**W7.19 — `BA-assets-19` (P3):** zaseban acceptance bi obuhvatio preostalih sedam service-suite compile blokada te potrebnu PostgreSQL/Redis concurrency/failure/E2E matricu. Nije započet. `BA-assets-19` i susjedni nalazi su eksplicitno izvan trenutnog W7.18 naloga; početak zahtijeva zasebno odobrenje. Kompletan E2E critical flow i Perf smoke ostaju za kraj assets segmenta, ne za ovaj package push.
