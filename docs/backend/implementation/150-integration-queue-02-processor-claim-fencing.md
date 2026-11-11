# Paket 150 — W6.35 / `BA-integration-queue-02` processor-claim fencing

**Status:** zatvoreno na finding nivou<br>
**Datum:** 2026-11-07<br>
**Scope:** samo `BA-integration-queue-02`; `BA-integration-queue-05` i ostali nalazi nisu uključeni<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Finalni kodni SHA:** [`1677c74`](https://github.com/mudzy992/help-desk-enterprise/commit/1677c74578c459050b72a5777d469378b7493f5d)

## Nalaz i odluka o scopeu

`IntegrationJobProcessor` je ranije mogao pročitati `PENDING`/due `FAILED`, pa nakon nekontrolisanog razmaka označiti red `PROCESSING`. Dvije konkurentne BullMQ isporuke mogle su zato obje proći početni read i pozvati provider. Terminalni/failure upisi nisu bili vezani za dokaz da ih još uvijek izvršava isti pokušaj.

W6.35 zatvara samo `BA-integration-queue-02` (P1). Korisnik je odobrio ovaj konkretni nalaz nakon W6.34; ne širi se na `BA-integration-queue-05`. Zastarjeli `PROCESSING` lease se namjerno ne preuzima i stale-job recovery ostaje otvoren u BA-05.

## Implementacija

- `IntegrationJob` dobija monotonu `version`, logički `processingAttemptId`, nasumični `processingOwnerToken` i `processingLeaseExpiresAt`. Trajanje claim lease-a je pet minuta; evidentiranje lease-a samo po sebi ne uključuje stale `PROCESSING` recovery.
- `claimForProcessing` prihvata samo aktuelni BullMQ logical-attempt ID za `PENDING` ili već dospjeli `FAILED` red. Jedan `updateMany` compare-and-swap uslovljava `id`, `status`, `version`, `attempts` i `nextRetryAt`; samo jedan poziv može promijeniti red u `PROCESSING`, povećati pokušaj/verziju i upisati owner/attempt/expiry.
- Processor učitava queue postavke prije claima, poziva kanalni dispatcher tek nakon uspješnog claima, a izgubljeni/duplicate/stale BullMQ delivery završava bez provider poziva i bez izmjene reda.
- `COMPLETED`, `FAILED` i `DLQ` tranzicije provjeravaju isti `PROCESSING` status, version, broj pokušaja, attempt ID, owner token i lease timestamp; uspješan terminalni CAS povećava verziju i briše claim polja. Zbog toga stale worker ne može prepisati novije stanje.
- Failure handler ažurira email ledger i zakazuje naredni BullMQ pokušaj samo ako je fenced `FAILED` tranzicija uspjela. Izgubljeni claim ne mijenja ledger i ne enqueue-a stale retry.
- Dodani su repository/processor regressions i registrovani PostgreSQL integration spec `integration-job-processor-claim.integration.spec.ts`. Test pokriva tačno jednog pobjednika concurrent claim-a, odbijanje pogrešnog/stale pokušaja, fencing stare completion/failure putanje nakon retry claima i eksplicitno to da expired `PROCESSING` ostaje netaknut dok BA-05 nije implementiran.
- Nova migracija je `20271031180000_integration_job_processor_claim_fence`. Runtime readiness sada očekuje tu migraciju kao najnoviju uspješnu schema migraciju.

## Prihvatni dokaz

### Automatski CI

- CI [`42408942663`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42408942663) na SHA `1677c74` prošao je generated-Prisma backend build, lint, full Jest, cijeli PostgreSQL+Redis integration job (uključujući registrovani BA-02 claim-fencing spec), frontend build/test i Docs guard. Migration replay i provjera aktuelne migration history prošli su u disposable CI bazi.
- Ukupni CI nije zelen: backend container/supply-chain zero-high/critical gate i CI gate pali su zbog `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (scanner navodi fixed `1.4-r0`). E2E critical, E2E install wizard i read-only inventory su `skipped`, ne passed.
- Perf [`42408942726`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42408942726) **failed** na nepromijenjenom query budgetu: `2.122 > 2.1` preko 51.120 zahtjeva (p95 3, max 34). Ostali navedeni latency/payload/HTTP thresholdi prošli su. Run ne utvrđuje BA-02 uzročnost; prag nije mijenjan.

### Granica baze, migracija i rollouta

- Migracija `20271031180000_integration_job_processor_claim_fence` replayovana je samo na disposable CI bazi. Nije korištena ciljna baza i nije izvršena lokalna/production migracija.
- Ranija migration stavka `be1c79db` nije mijenjana. Nema deploymenta, redeploy preporuke, PR-a ni mergea. Svaki budući release handoff mora navesti potvrđene pending migration ID-eve i redoslijed; ovaj finding-level closeout nije rollout odobrenje.

## Registar nakon closeouta

- `BA-integration-queue-02`: **zatvoreno**. `BA-integration-queue-05` (stale `PROCESSING` recovery), `BA-integration-queue-03/04`, preostali audit 19 nalazi, `BA-notifications-14`, `BA-websocket-14` i globalni BA-15 full critical-flow acceptance ostaju otvoreni/pending.
- Audit jedinica 19: **2/15 zatvorenih**, 13 otvoreno.
- Val 6: **39/109 zatvorenih**, **70 otvorenih** (12 P1 / 41 P2 / 17 P3); Val 6 nije završen.
- Izvorni auditi/generisani plan: **522 otvoren / 170 zatvoren**.
- Globalni registar: **532 otvoren / 160 zatvoren**; deset poznatih statusnih divergencija, status-page zapisi i historijski closeouti ostaju nepromijenjeni.

## Provjera closeout dokumentacije

- `node scripts/check-backend-findings.mjs --write` regenerisao je plan iz source audita; `node scripts/check-backend-findings.mjs` potvrdio je **692/692**, P1=174/P2=368/P3=150 i potpun owner/val mapping.
- `node --test scripts/check-backend-findings.test.mjs`: **13/13 passed**.
- `node scripts/check-docs-content.mjs`: **OK** (32 stranice, 8 prevoda, 10 provjera); `node --test scripts/check-docs-content.test.mjs`: **9/9 passed**.
- `git diff --check`: **passed**.
