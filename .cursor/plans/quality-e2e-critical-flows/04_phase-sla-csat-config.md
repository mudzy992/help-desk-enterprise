# Faza 4 — Tokovi 7–9 + verifikacija

## 7. SLA — `e2e/tests/07-sla.spec.ts`

1. **Timers:** SLA profil/rule preko `/sla` UI ili API, kratki `responseMinutes` (1). Create tiketa → `TicketResponse` / detail pokazuje due.
2. **Pause:** `WAITING_FOR_USER` → breach se ne diže dok je pauza (scanner 60s; assert `pausedAt` / due pomak, ne lažni overdue).
3. **Overdue:** tiket čiji je sat istekao (kratki timer + wait ≤ scan 60s + buffer) → badge na listi + overdue filter chip (`ticket-list-filters`).

Ne dirati `ticketSlaBreachScanIntervalMs`. Timeout spec-a ~90s samo za ovaj test.

## 8. Close codes + CSAT — `e2e/tests/08-close-codes-csat.spec.ts`

1. PATCH/UI resolve **bez** close code → `CLOSE_CODE` / required-fields greška.
2. Resolve s allow-list kodom + note → `RESOLVED`.
3. CSAT prompt na detail (`ticket-csat-panel`, `askOnResolved`).
4. Submit rating → `GET /tickets/csat/summary` i/ili `GET /reports/packs/monthly-kpi` pokazuje agregaciju (pravi KPI, ne hardcodovan broj).

## 9. Config ops — `e2e/tests/09-config-ops.spec.ts`

UI `/admin/config-versions` (postojeći workspace):

1. Create snapshot (reason).
2. Validate (dry-run) → nema live write.
3. Shadow → `sampleSize` / mismatch brojači; status verzije se ne mijenja u SHADOW persistenciju (MATRIX: shadow je READ-ONLY).
4. Activate → tagged ACTIVE.
5. Rollback → nova ACTIVE s `rollbackOfVersion`; stara `ROLLED_BACK`.

Ako UI nema shadow dugme, shadow korak je `POST /config-versions/:id/shadow` + reload diff panela (isti API kao UI).

## Verifikacija (obavezno prije “gotovo”)

- `cd e2e && npm test` — svih 9 specova zeleno na lokalnom stacku
- `backend` Jest i `frontend` Vitest **nisu** preimenovani niti obrisani
- Nema `.github/workflows/`

## File length

Jedan spec ~100–150 linija; ponavljanje (login, create ticket, poll job) u helpers.
