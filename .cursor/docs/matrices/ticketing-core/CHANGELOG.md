# CHANGELOG — ticketing-core

## 2026-09-11
- Confidential ACL je u `ticket-confidential-visibility`, nije dio ticketing-core CRUD-a.
- Create UI uvijek šalje `originUnitId`. SuperAdmin / user bez `User.organizationalUnitId` ne može naslijediti origin — `ORIGIN_UNIT_REQUIRED`.
- Inicijalna matrica: Ticket CRUD, formVersionRef binding, routing apply (PENDING/UNROUTED), postojeći RBAC/OU/service scope, ChangeLog na create/update. Priority i state machine su zasebne matrice.

## 2026-09-21
- `TicketResponse` dobija `originUnitName`, `originUnitPath` i `serviceName` (DAT-01); batch razrješenje u `loadTicketDisplayLabels`. Polja su opciona (`null` ako se id ne razriješi).
- `GET /tickets`: novi filteri (`status[]`, `requesterId`, `groupId`, `unassigned`, `overdue`, `atRisk`, `createdFrom/To`, `includeArchived`), `sort`/`dir` i paginacija s odgovorom `{ items, total, page, pageSize }`; bez `page`/`pageSize` ostaje niz (LST-05/06, DAT-01).
- Vidljivost liste je predikat u upitu umjesto petlje po tiketu (nema N+1 nad confidential činjenicama); export i CSAT sažetak koriste isti builder. Export više ne filtrira u memoriji.
