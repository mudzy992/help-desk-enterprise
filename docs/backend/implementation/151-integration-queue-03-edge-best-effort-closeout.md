# Paket 151 — W6.36 / `BA-integration-queue-03` Edge publish outcome

**Status:** zatvoreno na finding nivou<br>
**Datum:** 2026-11-07<br>
**Scope:** samo `BA-integration-queue-03`; `BA-integration-queue-04/05` i ostali nalazi nisu uključeni<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Finalni kodni SHA:** [`b9dcc6c`](https://github.com/mudzy992/help-desk-enterprise/commit/b9dcc6cdedc072c542813d8de3653ccaed24c5f0)

## Nalaz i granica scopea

`PublishEdgeEventToRedisService` je odbacivao rezultat Redis `PUBLISH` komande, nakon čega je processor svaki Edge posao označavao kao `COMPLETED`. Nula subscribera je zato mogla izgledati kao isporuka. Istovremeno, pozitivan Redis subscriber count ne dokazuje obradu u API procesu niti isporuku krajnjem Socket.IO klijentu.

Za ovaj finding korištena je iz audita prihvaćena bounded alternativa: eksplicitni `PUBLISHED_BEST_EFFORT` status. Nije uveden Redis Stream, consumer group, API inbox, end-to-end acknowledgement ili exactly-once ugovor.

## Implementacija

- `PublishEdgeEventToRedisService.publish()` sada vraća Redisov subscriber count.
- `ProcessEdgeEventIntegrationJobService` tretira count `> 0` kao `PUBLISHED_BEST_EFFORT`. Komentar i BS/EN Admin tekst eksplicitno kažu da subscriber count nije potvrda krajnje isporuke.
- Count `0` baca `EdgeEventNoSubscribersError` sa stabilnim, payload-free kodom `EDGE_EVENT_NO_SUBSCRIBERS`. Processor prosljeđuje grešku postojećem failure/backoff putu: claim-fenced status postaje `FAILED`, `lastError` čuva kod, postavlja se `nextRetryAt`, a slijedi retry queue zapis. U slučaju iscrpljenih pokušaja postojeći DLQ prag ostaje na snazi.
- Repository čuva `PUBLISHED_BEST_EFFORT` samo kroz BA-02 claim-fenced terminalnu tranziciju; ta tranzicija prihvata isključivo `EDGE_EVENT` jobove. Processor ne zove `markCompleted` za Edge događaj.
- Backend status filter, frontend status/type, info badge i BS/EN prijevodi uključuju novi status. Best-effort status nije retryable kroz Admin UI.
- Prisma enum i additive migracija dodaju `PUBLISHED_BEST_EFFORT`; runtime readiness sentinel očekuje novu migraciju.

## Prihvatni dokaz

### Testovi

- Jedinični testovi provjeravaju da Redis publish service vraća broj subscribera, `0` proizvodi retryable kod, pozitivan count daje samo best-effort ishod, Redis greške ostaju u retry putu, processor ne upisuje `COMPLETED`, a repository tranzicija poštuje BA-02 fencing.
- PostgreSQL + Redis integration spec `integration-job-edge-event-delivery.integration.spec.ts` registrovan je u isolated runneru. Zero-subscriber scenario provjerava `FAILED`, kod greške, `nextRetryAt` i retry enqueue. Positive scenario koristi stvarni Redis subscriber i PostgreSQL red te provjerava `PUBLISHED_BEST_EFFORT` i primljeni Pub/Sub payload. Taj dokaz i dalje nije end-to-end klijentska potvrda.

### Lokalna provjera

`backend/node_modules`, `backend/src/generated/prisma` i `frontend/node_modules` nisu bili prisutni, pa lokalni Jest/build nisu pokrenuti. Prošli su `git diff --check`, locale JSON parse, `node --check` za isolated-runner skripte, `node scripts/check-migration-policy.mjs` i `node --test scripts/check-migration-policy.test.mjs` (**3/3**). Generated-Prisma tipizacija, puni backend/frontend testovi i real Redis/PostgreSQL suite izvršeni su automatskim CI-jem ispod.

### Automatski CI i Perf

- CI [`42423568636`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42423568636) na SHA `b9dcc6c`: generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis migration replay i integration suite, frontend build/test i Docs guard su passed. Replay je bio samo na disposable CI bazi; E2E critical/install i read-only inventory su `skipped`.
- Ukupni CI **nije zelen**: container high/critical gate i CI gate failed zbog `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (scanner navodi fix `1.4-r0`).
- Perf [`42423568707`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42423568707) **failed** na query budgetu `2.122 > 2.1` kroz 50.797 zahtjeva (p95 3, max 34). BA-03 uzročnost nije utvrđena, a prag nije mijenjan.

## Migracija, deployment i preostali scope

Tačna nova migracija je `20271031190000_integration_job_edge_publish_best_effort`, poslije `20271031180000_integration_job_processor_claim_fence` u repozitorijskom redoslijedu. Prije bilo kakvog budućeg releasea potrebno je na tačnoj ciljnoj bazi potvrditi sve pending migracije i redoslijed; ranije neusaglašeni `be1c79db` ID se ne pogađa. Migracija nije izvršena nad ciljnom bazom niti lokalno; nema PR-a, mergea, deploymenta ili redeploy tvrdnje.

Zatvoren je samo `BA-integration-queue-03`. `BA-integration-queue-04/05`, preostali nalazi audita 19, `BA-notifications-14`, `BA-websocket-14` i globalni BA-15 full critical-flow acceptance ostaju otvoreni/pending. Audit jedinica 19 je **3/15 zatvorena**. Val 6 je **40/109 zatvorenih, 69 otvorenih** (11 P1 / 41 P2 / 17 P3); izvorni audit/generisani plan su **521 otvoren / 171 zatvoren**, a redovi globalnog registra **531/161**. Deset poznatih statusnih divergencija, status-page zapisi i raniji closeouti nisu mijenjani. Val 6 nije završen.
