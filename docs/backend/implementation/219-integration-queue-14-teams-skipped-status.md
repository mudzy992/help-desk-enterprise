# Paket 219 — BA-integration-queue-14: Teams non-delivery završava kao SKIPPED

**Status:** implementirano; CI i vlasnička potvrda AC2 u toku. **Migracija odobrena od vlasnika** (opcija „novi status SKIPPED").
**Nalaz:** audit 19 §3.14 (P3) — Teams ishodi `skipped`/`gone`/nonretryable završavali su kao generički `COMPLETED`, pa admin prikaz nije razlikovao stvarnu isporuku od trajnog odustajanja.

## Promjene

| Fajl | Promjena |
| --- | --- |
| `prisma/schema/enums.prisma` + migracija `20271130230000_integration_job_skipped_status` | `IntegrationJobStatus` dobija `SKIPPED` (prije `FAILED`); runtime readiness pin pomjeren na novu migraciju (`database-runtime-contract`). |
| `teams-delivery.service.ts` | `process()` sada vraća `TeamsDeliveryOutcome` umjesto da ga odbaci. |
| `integration-queue.processor.ts` | TEAMS `skipped`/`gone` → terminalni `SKIPPED` s kodom `TEAMS_DELIVERY_SKIPPED` / `TEAMS_CONVERSATION_GONE` i log linijom `status=SKIPPED outcome=…`; `sent/updated/unchanged` i dalje `COMPLETED`. |
| `integration-job.repository.ts` | `markSkipped(claim, code)` — claim-fenced terminalna tranzicija, samo za TEAMS. |
| `integration-queue.types.ts`, `to-integration-job-response.ts`, `integration-queue.constants.ts` | admin kodovi za oba ishoda; `SKIPPED` u admin status listi. |
| `integration-job-terminal-retention.service.ts` | `SKIPPED` je terminalni status i ulazi u retention/redaction životni ciklus. |
| Frontend (`integration-queue-types.ts`, `map-integration-job-error-code.ts`, badge tone, bs/en i18n) | status `SKIPPED` („Preskočeno", warning ton) i labele za oba outcome koda. |
| `handle-integration-job-failure.ts` (uz BA-13) | interni stabilni kodovi (`EDGE_EVENT_NO_SUBSCRIBERS` i dr.) čuvaju se tačno — ispravka CI pada BA-13. |
| Testovi | procesor: skipped/gone → SKIPPED s kodom, nikad COMPLETED; repository: claim-fence + TEAMS-only guard; retention spec status lista. |

## Semantika

- `mode=off`, uklonjen/nedostajući razgovor, mismatch i nonretryable provider greška više ne izgledaju kao uspjeh: posao je terminalan (bez retrya), ali eksplicitno `SKIPPED` s grubim ishodom; obični `skipped` i trajna provider greška trenutno dijele isti kod, pa se međusobno ne razlikuju.
- **Deployment zahtijeva migraciju** `20271130230000_integration_job_skipped_status` prije pokretanja novog API/worker builda, nakon backup-a i provjere uspješnosti migracije; bez nje worker puca na nepoznatoj enum vrijednosti pri čitanju SKIPPED redova (nema takvih redova prije migracije, ali novi kod ih upisuje).

## Dokaz

- Lokalno (stub harness): processor, repository, response, retention, teams — sve zeleno; frontend i18n coverage + error-code spec **18/18**, `i18n:check`, prettier i tsc čisti; migration-policy + integration-runner guardovi **23/23**.
- CI (generated Prisma + migration replay + integration) je autoritativan.
