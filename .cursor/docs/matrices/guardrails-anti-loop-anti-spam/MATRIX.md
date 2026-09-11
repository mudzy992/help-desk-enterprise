# MATRIX — guardrails-anti-loop-anti-spam

## Cilj
Server-side zaštita od slučajnih duplih tiketa, ponovljenih automation/event triggera i prevelikih bulk broadcast-a. Koristi postojeći ChangeLog + `SYSTEM_EVENT` i `GuardrailClaim` unique claim. Nije paralelni audit/queue sistem i nije hard rate limit.

## Settings
| Setting | Default |
|---|---|
| `private.guardrails.antiLoop.enabled` | `true` |
| `private.guardrails.antiLoop.duplicateWindowMinutes` | `2` |
| `private.guardrails.antiLoop.similarityThreshold` | `0.9` |
| `private.guardrails.antiLoop.mode` | `warn_only` |
| `private.guardrails.bulkBroadcast.confirmAboveRecipients` | `200` |

`maxRepeatsPerSubject` je konstanta `3` unutar prozora (nije RAW setting).

## Duplicate ticket
Isti `requesterId` + `serviceId` + Jaccard sličnost opisa ≥ prag u prozoru. Split/reopen child (`parentTicketId` / `reopenedFromTicketId`) se preskače.

| Mode | Ponašanje |
|---|---|
| `warn_only` | Persistira tiket, `duplicateWarnings` na response, ChangeLog `ticket_guardrail_duplicate`, `SYSTEM_EVENT` `ticket_guardrail_duplicate_warned:ticketNumbers` |
| `soft_block` | `409 DUPLICATE_TICKET_BLOCKED` dok klijent ne pošalje `acknowledgeDuplicate: true` |

Concurrent create za isti requester+service je serializovan (`runExclusiveGuardrail`). U `soft_block` drugi zahtjev vidi prvi tiket i pada.

## Automation / event loop
`GuardrailClaim` unique `(kind, subjectKey, fingerprint)`. Waiting-for-user remind/auto-close claim-uje `automation` + `ticketId` + `action:enteredAt`.

| Ishod | Efekat |
|---|---|
| claimed | akcija se izvrši jednom |
| duplicate | idempotent skip (isti trigger već radi/odrađen) |
| loop | ≥ 3 claima istog subjecta u prozoru; skip + ChangeLog `ticket_guardrail_loop_suppressed` + `SYSTEM_EVENT` |

## Bulk broadcast
Ako `recipientCount > confirmAboveRecipients`, preview `requiresBroadcastConfirmation=true` i execute zahtijeva `broadcastConfirmed: true` (`400 BULK_BROADCAST_CONFIRMATION_REQUIRED`). Postojeći preview/rate-limit ostaju.

## Namjerno NIJE
CSAT, auto-archive, BullMQ job, AuditLog hash-chain, hard rate limit umjesto warn/soft-block.
