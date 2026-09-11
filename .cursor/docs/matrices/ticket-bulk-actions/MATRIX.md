# MATRIX — ticket-bulk-actions

## Cilj
OU/group scoped bulk akcije za Agent/Admin/SuperAdmin. **Bulk close je strogo zabranjen** (CLOSED/ARCHIVED), nezavisno od setting flaga.

## Akcije
`assign_group`, `assign_user`, `set_status` (bez close), `set_priority` (impact+urgency par, reason obavezan), `broadcast_message` (structured + preview + rate limit), `merge_into_parent`.

## Scope
Non-SuperAdmin: isti `originUnitId` + `assignedGroupId`. SuperAdmin smije cross-OU ako je setting uključen. Permissioni: `ticket.bulk.*` i `ticket.merge`.

## API
`POST /tickets/bulk` i `POST /tickets/bulk/preview`.
