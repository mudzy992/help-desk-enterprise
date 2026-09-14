# HANDOFF — config-versioning

## Urađeno
- Backend modul `config-versioning`: create/list/get/diff/validate/activate/rollback/shadow
- Settings keys, read-only mapping, dvije matrice
- Unit testovi validate/diff/rollback/shadow
- `npm run build` OK
- TASKS.md `[x]`

## Test
- Config-versioning specovi prolaze
- Full suite: 753 passed; 3 failed u `tickets.guardrails.spec.ts` (pre-existing: fixture `createdAt` 2026-09-11 vs `new Date()` 2026-09-14, 24h window)

## Van scope
Frontend UI, audit export, support bundle, WS events

