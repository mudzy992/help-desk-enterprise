# CHANGELOG — ticketing-core

## 2026-09-11
- Create UI uvijek šalje `originUnitId`. SuperAdmin / user bez `User.organizationalUnitId` ne može naslijediti origin — `ORIGIN_UNIT_REQUIRED`.
- Inicijalna matrica: Ticket CRUD, formVersionRef binding, routing apply (PENDING/UNROUTED), postojeći RBAC/OU/service scope, ChangeLog na create/update. Priority i state machine su zasebne matrice.
