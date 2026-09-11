# CHANGELOG — guardrails-anti-loop-anti-spam

## 2026-09-11
- CSAT submit i auto-archive reuse `GuardrailClaim` (event/automation). Detalji u `csat-feedback` i `data-lifecycle-archive`.
- Settings-driven duplicate ticket (warn_only/soft_block), unique `GuardrailClaim` za automation/event idempotency i loop cap, te extra potvrda bulk broadcast-a iznad praga primalaca. Audit kroz postojeći ChangeLog + SYSTEM_EVENT.
