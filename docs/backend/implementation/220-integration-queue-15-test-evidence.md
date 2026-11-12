# Paket 220 — BA-integration-queue-15: compile-block uklonjen, crash/claim dokazna matrica

**Status:** implementirano; CI i vlasnička potvrda AC3 u toku.
**Nalaz:** audit 19 §3.15 (P3) — kritični DB/processor/crash testovi bili su compile-blocked (nedostajući generated Prisma enumi/delegati), a E2E 04 je samo pollavao postojanje joba bez ikakvog ishoda.

## Stanje i promjene

| Aspekt | Pokriće |
| --- | --- |
| Compile-blocked suiteovi | Riješeno CI generacijom Prisma clienta prije build/testa; svi integration-queue suiteovi (repository, processor, failure, scheduler, admin) izvršavaju se u svakom CI runu. |
| Duplicate claim / konkurencija | `integration-job-processor-claim.integration.spec.ts`: tačno jedan claimer za isti BullMQ pokušaj; fencing starog pokušaja nakon retry claima. |
| Crash / istekli claim | isti suite: istekli claim se karantiniše jednom i originalni worker je fenčan; unknown-outcome karantene se čuvaju kroz retention. |
| Dispatch recovery | `integration-job-dispatch-recovery.integration.spec.ts`: enqueue gap i due retry sa stabilnim attempt ID-jevima; admin retry + e-mail ledger + hash-chained audit prije recoveryja. |
| Edge ishod | `integration-job-edge-event-delivery.integration.spec.ts`: zero-subscriber ostaje retryable (ne COMPLETED); pozitivan subscriber count = best-effort. |
| **E2E 04 ojačan (novo)** | `e2e/tests/04-realtime-notifications.spec.ts` sada, uz postojanje EMAIL/EDGE joba, polluje dok posao ne **napusti PENDING** (PROCESSING ili bilo koje terminalno/retry stanje) — dokaz da worker obrađuje red, bez pretpostavke o provider ishodu u seed okruženju. |

## Dokaz

- Lokalno se E2E ne pokreće (nema stacka); dnevni schedule CI izvršava puni E2E. CI unit/integration jobovi su autoritativni za backend suiteove.
- Bez promjene produkcijskog koda; bez migracije.
