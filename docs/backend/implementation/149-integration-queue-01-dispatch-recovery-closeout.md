# Paket 149 — W6.34 / `BA-integration-queue-01` durable dispatch recovery

**Status:** zatvoreno na finding nivou<br>
**Datum:** 2026-11-07<br>
**Scope:** samo `BA-integration-queue-01` iz [audita 19, §13 i §18](../audits/19-integration-queue.md#18-w634-closeout--ba-integration-queue-01-2026-11-07)<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Finalni testani SHA:** [`03456b0`](https://github.com/mudzy992/help-desk-enterprise/commit/03456b0471d392b7243db0361868918f558e6461)

## Nalaz i odluka o scopeu

Postgres `IntegrationJob` i BullMQ Redis queue ne dijele transakciju. Neuspjeli ili izgubljeni `queue.add` acknowledgement mogao je ostaviti trajno orphanovan `PENDING` enqueue, due `FAILED` retry ili admin-retry posao. Admin retry nije imao actor-attributed audit zapis i njegov DB transition nije bio sigurno oporavljiv kroz zajedničku dispatch putanju.

Zatvoren je samo `BA-integration-queue-01`. W6.34 implementira recovery za `PENDING` i već due `FAILED` redove, stabilne logical-attempt BullMQ IDs, te auditiranu admin-retry tranziciju koju periodični dispatcher može ponovo obraditi. Namjerno nisu dodani stale `PROCESSING` lease recovery ili processor claim; to bi prešlo u `BA-integration-queue-02/05`.

## Implementacija

- Novi `IntegrationJobDispatchReconcilerService` čita ograničenu, oldest-first stranicu `PENDING` redova i `FAILED` redova čiji je `nextRetryAt` prazan ili istekao. Budući retryji se ne šalju prerano.
- Dispatch IDs su deterministički po logical attemptu: enqueue i admin retry koriste DB integration-job ID; failed retry koristi isti DB ID uz attempt broj. Reconcile, direktni enqueue i retry putanje zato dedupe-uju isti attempt umjesto da prave timestamp ID.
- Enqueue/admin queue-add greška ne pretvara trajni DB red u izgubljeno stanje. Reconcile periodično pokušava ponovo; neuspjeh jedne stavke se evidentira bez prekida cijele stranice.
- Failure handling upisuje email delivery retry due-time prije Redis queue-add granice, tako da durable email ledger i integration job ostaju usklađeni ako Redis ne primi posao.
- Admin retry sada u jednoj DB transakciji: provjerava retryable `FAILED`/`DLQ` status, resetuje integration-job state, vraća samo retryable e-mail delivery ledger state i zapisuje actor-attributed `integration.job.retried` hash-chained audit entry. `UNKNOWN` e-mail delivery se ne vraća u slijepi retry.
- Ako immediate admin `queue.add` ne uspije ili mu acknowledgement izgubi se, `PENDING` state i stabilni ID omogućavaju periodičnom dispatcheru da završi dispatch. PostgreSQL integration test to dokazuje end-to-end za `EMAIL` ledger i audit.
- Reconcile schedule je worker maintenance job sa stabilnim scheduler ID-om i jednim processorom; audit action/schema/compatibility registri i BS/EN scheduler/audit UI prijevodi su dopunjeni.

## Prihvatni dokaz

### Lokalno

- Fokusirani backend Jest: **10 suites / 41 tests passed**; PostgreSQL recovery suite je lokalno **skipped** zbog nedostupnog generated Prisma Clienta i lokalne DB (2 testa skipped).
- `scheduled-jobs.wiring.spec.ts`: **2/2 passed**.
- `npm run test:integration-harness`: **17/17 passed**, uključujući registraciju novog BA-01 PostgreSQL speca.
- `npm run wiring:check`: **99 controllers / 619 routes**; authenticated 599, public 19, webhook 1, worker 1.
- `npm run audit:traceability`: **692/692**, prije ovog statusnog closeout updatea; nakon updatea plan je ponovo generisan i provjeren.
- Frontend audit/scheduler i18n coverage: **16/16 passed**; `npm run lint`, targeted backend ESLint, Prettier i `git diff --check` passed.
- Dijagnostički Jest shimovi za nedostajući lokalni Prisma-generated modules uklonjeni su nakon testa; nisu commitovani.

### Finalni automatski CI i Perf

- CI [`42404889174`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42404889174) na finalnom SHA `03456b0`: generated-Prisma backend build/lint/full Jest, cijeli PostgreSQL+Redis integration job (uključujući registrovani BA-01 recovery spec), frontend build/test i Docs guard — **passed**.
- E2E critical flows, E2E install wizard i read-only inventory — **skipped**, ne passed; nisu ručno dispatchani.
- Container/supply-chain enforcement pao je na `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (scanner navodi fixed `1.4-r0`); zato je i ukupni CI gate **failed**, ne zelen.
- Automatski Perf smoke [`42404889214`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42404889214) pao je na DB query budgetu: `2.124 > 2.1` kroz 50.707 zahtjeva, p95 3, max 35. Prag nije mijenjan. Run ne daje uzročnu atribuciju `BA-integration-queue-01`; rezultat se ne prikazuje kao zelen.

## Izvan scopea i rollout

- Nije riješen stale `PROCESSING` recovery, atomic processor lease/claim, duplicate provider send, payload scope/redaction ni ostali nalazi audit 19. `BA-integration-queue-02/05` ostaju otvoreni.
- Nije korištena target baza; nisu mijenjane niti pokretane migracije. Nema PR-a, mergea, deploymenta ili redeploy preporuke.
- Nije mijenjan Perf threshold. Globalni BA-15 full critical-flow acceptance nije potvrđen; E2E jobs su bili skipped.
- Deset poznatih audit/register statusnih divergencija, status-page evidencija i historijski closeouti ostaju netaknuti.

## Registar nakon closeouta

- BA-integration-queue-01: **zatvoreno**.
- Audit jedinica 19: **1/15 nalaza zatvoren**, ostalih 14 otvoreno.
- Val 6: **38/109 zatvorenih**, **71 otvoren** (13 P1 / 41 P2 / 17 P3); Val 6 kao cjelina nije završen.
- Izvorni auditi/generisani plan: **523 otvoren / 169 zatvoren**.
- Globalni registar: **533 otvoren / 159 zatvoren**; deset poznatih statusnih razlika ostaje ista.
- Sljedeći W6 nalaz nije ovim paketom odabran niti odobren; prije početka novog rada traži se zasebna scope odluka.
