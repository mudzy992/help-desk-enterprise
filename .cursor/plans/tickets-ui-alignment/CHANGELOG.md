# CHANGELOG — tickets-ui-alignment

## 2026-09-21 — F1 slojevi 0–2
- Plan folder, odluke F1-1…F1-6.
- `TicketResponse`: `originUnitName`, `originUnitPath`, `serviceName` (batch, bez N+1). FE tip `ServiceAvailability` dobija `DOWN` (+ ton i BS/EN labela).
- Claim atomičan; take-over ukinut; `TICKET_NOT_CLAIMABLE` → 409 s `claimedByName`.
