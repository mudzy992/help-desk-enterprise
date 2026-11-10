# Package closeout — `BA-service-catalog-11`

**Paket:** audit 15 / `service-catalog` — durable change-owned downtime sync, retry i drift reconciliation<br>
**Nalaz:** `BA-service-catalog-11` (P2) — zatvoren nakon implementacije i zelenog CI gatea<br>
**Implementacijski commit:** `4a0a0011d0f4b95f5a50267c54ebadc7bea57158`<br>
**Test-fixture korekcija:** `faf00f497032a1ed380f9500bf4c762c56a6aebe`<br>
**Finalni testani SHA:** `faf00f497032a1ed380f9500bf4c762c56a6aebe`<br>
**CI:** [`41444022450`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41444022450) — success na finalnom testanom SHA-u<br>
**Perf smoke:** [`41442784187`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41442784187) — success na runtime SHA-u `4a0a0011d0f4b95f5a50267c54ebadc7bea57158`; kasniji commit `faf00f4` mijenjao je samo test fixturee<br>
**DB migracije:** nema BA-11 migracije ni izmjene Prisma sheme

## Nalaz i acceptance

`ChangeScheduleService.syncDowntime` i release putanja su prije paketa radili best-effort sinhronizaciju nakon lifecycle commita. Ako je poziv prema Service Catalogu pao, lifecycle promjena je već bila potvrđena, ali nije postojao durable retry ni drift reconciliation koji bi osigurao konačno usklađivanje change-owned downtime prozora.

Acceptance je tražio da lifecycle operacije trajno zapišu sync namjeru u istu transakciju kao business promjenu, worker sigurno obradi ponovljenu isporuku, periodični reconciler pronađe i popravi drift, a Ops Health prikaže backlog i dead-letter stanje. Ovo je zatvaranje samo `BA-service-catalog-11`. Preklapajući `BA-changes-08` i `BA-changes-13` ostaju otvoreni; ticket-message/search, spec 56 i njegov prag od 250 ms nisu mijenjani.

## Implementacija

- Lifecycle create/reschedule/approve/release putanje dodaju naredbu na postojeći transactional outbox unutar roditeljske transakcije. Topic je `change.downtime.sync`; dedupe key je vezan za change ID i lifecycle version. Rollback lifecycle transakcije povlači i outbox namjeru.
- Worker validira payload i sinhronizuje željeni downtime state; transient greške prolaze kroz postojeći durable retry/dead-letter ugovor. Periodični, keyset-paginirani reconciler pretražuje changeove, detektuje drift i zapisuje idempotentnu retry/replay namjeru.
- Outbox dedupe key prosljeđuje se u schedule sync. Ako ponovna isporuka nema schedule side effecta, njen skip-only audit event se deduplicira i nosi `outboxDedupeKey` u event detailu.
- Backend Ops Health izlaže pending, processing, dead-letter i najstariju poruku; dead-letter ili prekoračena starost pending rada daju `degraded`. Ops Health UI i EN/BS tekstovi prikazuju novi signal. Neuspjelo čitanje signala ostaje `unknown`, a ne lažno zdravo.
- Ne mijenja se ponašanje W7.15 fail-closed hard-delete politike ni AssetEvent arhiviranja. Ne zatvara se niti mijenja nijedan susjedni audit nalaz.

## Direktni testni dokaz

- `backend/src/modules/changes/changes-service-downtime-outbox.spec.ts` — lifecycle promjene dodaju outbox intent; dedupe i rollback granica su pokriveni.
- `backend/src/modules/changes/change-downtime-outbox.spec.ts` — payload validacija, stabilni topic/dedupe contract i retry konfiguracija.
- `backend/src/modules/changes/change-downtime-outbox-reconciler.service.spec.ts` — dispatch, drift detection, idempotentna intent/replay putanja, error handling i Ops Health status.
- `backend/src/modules/changes/change-schedule-downtime-sync.spec.ts` — desired-state upsert/removal i idempotentnost skip-only audit eventa pri istoj outbox key ponovnoj isporuci.
- `backend/src/modules/changes/change-downtime-outbox.integration.spec.ts` — pravi PostgreSQL: atomic commit/dedupe, rollback roditeljske transakcije i dispatch validiranog persisted payloada.
- `backend/src/modules/ops-health/ops-health.service.spec.ts`, `frontend/src/lib/ops/ops-health-view.spec.ts` i `frontend/src/components/admin/ops-health-sections.spec.tsx` — health signal mapping/rendering i degradirano/unknown stanje.

## CI i testni dokaz

Finalni CI run [`41444022450`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41444022450) testirao je `{faf00f497032a1ed380f9500bf4c762c56a6aebe}`:

- **Backend build + test:** passed; Prisma Client je generisan u CI-u, schema/build/lint/wiring i full Jest posao prošli su.
- **PostgreSQL/Redis integration:** passed; migration policy/replay na disposable DB, integration harnessi i `Run real PostgreSQL integration suites` prošli su, uključujući novi BA-11 PostgreSQL suite.
- **Frontend build + test:** passed; lint, format, testovi, production build i frontend budget koraci prošli su.
- **Docs guard, container/supply chain i CI gate:** passed. Korak `Enforce zero high/critical image vulnerabilities` bio je **skipped** jer je korak uslovan i scan output nije imao high/critical nalaza (`count == 0`); nije zaseban enforcement pass.
- **E2E:** `E2E critical flows` i `E2E install wizard` bili su **skipped** na push triggeru prema workflow uslovima (critical flows se pokreću na PR/schedule ili odgovarajući dispatch; wizard samo na dispatchu). Ne prikazuju se kao passed.
- **Perf:** odvojeni run [`41442784187`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41442784187) na core runtime SHA-u `4a0a0011d0f4b95f5a50267c54ebadc7bea57158` prošao je sve smoke/query-budget pragove: service-catalog p95 `44.06 ms` (limit `<500 ms`), ticket-message p95 `765.66 ms` (limit `<1000 ms`), globalni query average `2.098` kroz `48,403` zahtjeva (limit `2.1`). Perf nije ponovo pokrenut na `faf00f4`, jer je taj follow-up mijenjao samo test fixturee, ne runtime.
- **Neuspjeli pokušaj i korekcija:** CI [`41442784115`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41442784115) na SHA `4a0a0011d0f4b95f5a50267c54ebadc7bea57158` pao je u frontend build koraku zbog test fixture cast-a koji nije tipno preklapao `OpsOverview`, te u PostgreSQL integration suiteu jer je dispatch test obradio pending poruku iz prethodnog test casea. Korekcije: fixture cast je eksplicitno išao preko `unknown`, a prethodni testni outbox red se čisti nakon dedupe provjere. Oboje su test-only greške; nisu klasifikovane kao preegzistentne. Raw run log preuzimanje preko `gh run view --log-failed` vratilo je `EOF`; tačni uzroci uzeti su iz GitHub check-run annotations. Nakon popravke, CI `41444022450` na finalnom SHA-u je zelen.

## Registar nalaza

- Zatvoren: samo `BA-service-catalog-11` (P2).
- Ostaju otvoreni: `BA-service-catalog-01`–`09`, `12`–`15`; `BA-changes-08` i `BA-changes-13` ostaju zasebno otvoreni, kao i svi ostali findings.
- `service-catalog`: 4 P1, 8 P2, 3 P3 ukupno; **13 otvorenih / 2 zatvorena**.
- Globalni deklarisani zbir: **568 otvorenih / 124 zatvorena / 692 ukupno**. Machine-readable plan: **571 otvoreno / 110 zatvorenih / 11 historijskih / 692 ukupno**; preegzistentna razlika od tri statusa ostaje nepromijenjena. Severity zbir ostaje P1=174, P2=368, P3=150.

## Migracija, rollout i rollback

Nema Prisma schema promjene, BA-11 migracije, manual DB koraka ni target-DB pristupa. CI je koristio disposable PostgreSQL i prošao replay postojećih migracija; to nije promjena ciljne instalacije. Ciljna baza nije provjeravana niti mijenjana.

Deploy aplikacijske verzije koja uključuje i producer i worker/reconciler zajedno (ili worker podršku prije nego što se novi producer aktivira). API/worker rollout može biti rolling: ako worker još nije aktivan, outbox čuva namjeru do obrade. Ops Health `changeDowntimeSync` signal prati backlog/dead-letter stanje.

Rollback je aplikacijski revert; nema DB rollbacka. Outbox redove ne brisati ručno: stariji worker možda ne poznaje novi topic, pa postojeći backlog mora ostati netaknut i biti obrađen nakon ponovnog deploya verzije koja sadrži kompatibilni worker. Sačuvati postojeći outbox/DLQ operator provenance. W7.15 fail-closed hard-delete i event archive ponašanje ostaju netaknuti.

## Lokalna provjera i ograničenja

- Lokalni ciljani backend Jest za BA-11 prošao je **5 suiteova / 24 testa** nakon idempotency izmjene; ciljani backend ESLint i `git diff --check` prošli su.
- Frontend ciljani Ops Health test prošao je **1 suite / 4 testa**; `npm run build` je prošao nakon tipne korekcije fixturea; frontend Prettier check i raniji `npm run i18n:check` prošli su (8.916 ključeva, 4.560 statičkih `t()` ključeva, 88 dinamičkih prefiksa).
- Lokalni standardni backend build/typecheck i real PostgreSQL suite nisu dobili potvrđen prolaz: build/Jest pokušaji bili su blokirani nedostajućim `backend/src/generated/prisma/client`/enums, a lokalni Prisma generate bio je blokiran TLS pristupom `binaries.prisma.sh`. To je lokalno sandbox ograničenje, ne CI blocker; finalni CI je generisao stvarni Prisma Client i prošao backend build/test i PostgreSQL integration.
- Prettier check je prošao za novi closeout, README i JSON; postojeće audit 15, audits README, HANDOFF, global registry i master-plan datoteke već su imale format razlike na parent SHA-u. Provjereno je da je parent verzija tih pet fajlova takođe neformatirana; historijski dokumenti nisu masovno preformatirani. Prvi poziv root-level Prettier binarne putanje nije je našao; check je ponovljen preko instalirane frontend binarne.
- Jedan privremeni lokalni ESLint pokušaj nakon integration cleanup patcha našao je sintaksnu grešku u testu; zatvorena je prije commita, a završni ciljani ESLint i CI integration suite su passed.
- `npm run lint` je ranije prošao bez grešaka, uz tri postojeća upozorenja u netaknutom `src/modules/sla/sla-scan-failure-quarantine.spec.ts`.
- Nije potvrđen target-DB pristup; nije bilo migracijske akcije ni target-DB provjere. Nije otvoren PR prema `master`, nije bilo mergea ni promjene grane.

## Sljedeći paket

**`BA-service-catalog-12` (P2):** scoped catalog writer ne smije globalno kreirati servise/kategorije niti čitati tuđe admin draftove. Nije započet u ovom closeoutu; `BA-changes-08`/`13` i ticket-message/search nisu dio sljedećeg scopea bez zasebnog acceptancea.
