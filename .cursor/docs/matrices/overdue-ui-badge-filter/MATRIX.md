# MATRIX — overdue-ui-badge-filter

## Cilj
Vizuelni `Overdue` badge i filter na ticket listi. Koristi postojeći SLA/overdue rezultat iz `TicketSlaState`. Ne računa timer, pause, breach niti eskalaciju.

## Domain → API
Postojeći flagovi: `isResponseBreached`, `isResolutionBreached`.

`isOverdue = isResponseBreached || isResolutionBreached`

Nema `TicketSlaState` → `isOverdue = false`. Polje se dodaje na postojeći ticket list / get / inbox response. Nema novog SLA algoritma.

## UI
- Badge `danger` (theme: SLA prekoračen) samo kad je `isOverdue`
- Filter chip AND-uje s postojećim search / status / priority / service / view
- Aktivno stanje: danger chip + red „Aktivni filteri“ s X; clear filters gasi overdue
- Saved view može sačuvati `overdue` uz ostale filtere

## Checklist
- [x] Overdue badge
- [x] Overdue filter
- [x] kompatibilnost sa postojećim filterima/searchom
- [x] koristi postojeći SLA/overdue backend podatak
- [x] vizuelno usklađeno sa `referenca-dizajn`
- [x] koristi postojeće theme/UI tokene
- [x] testovi
- [x] build/test provjera
- [x] nema regresija

## Namjerno NIJE
Nova SLA/timer/breach logika, SLA profili/rules, notification/escalation, redizajn ticket UI-a.
