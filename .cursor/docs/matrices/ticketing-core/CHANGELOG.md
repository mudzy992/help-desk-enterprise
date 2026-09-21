# CHANGELOG — ticketing-core

## 2026-09-11
- Confidential ACL je u `ticket-confidential-visibility`, nije dio ticketing-core CRUD-a.
- Create UI uvijek šalje `originUnitId`. SuperAdmin / user bez `User.organizationalUnitId` ne može naslijediti origin — `ORIGIN_UNIT_REQUIRED`.
- Inicijalna matrica: Ticket CRUD, formVersionRef binding, routing apply (PENDING/UNROUTED), postojeći RBAC/OU/service scope, ChangeLog na create/update. Priority i state machine su zasebne matrice.

## 2026-09-21
- `TicketResponse` dobija `originUnitName`, `originUnitPath` i `serviceName` (DAT-01); batch razrješenje u `loadTicketDisplayLabels`. Polja su opciona (`null` ako se id ne razriješi).
