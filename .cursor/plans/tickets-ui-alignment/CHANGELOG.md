# CHANGELOG — tickets-ui-alignment

## 2026-09-21 — F1 slojevi 0–2
- Plan folder, odluke F1-1…F1-6.
- `TicketResponse`: `originUnitName`, `originUnitPath`, `serviceName` (batch, bez N+1). FE tip `ServiceAvailability` dobija `DOWN` (+ ton i BS/EN labela).
- Claim atomičan; take-over ukinut; `TICKET_NOT_CLAIMABLE` → 409 s `claimedByName`.

## 2026-09-21 — F1 sloj 3 (lista)
- `GET /tickets`: filteri `status[]`, `requesterId`, `groupId`, `unassigned`, `overdue`, `atRisk`, `createdFrom/To`, `includeArchived`; `sort`/`dir`; `page`/`pageSize` s odgovorom `{ items, total, page, pageSize }`. Bez paginacije ostaje niz.
- Vidljivost je predikat u `where`-u (`list/`): scope kao `originUnitId IN (...)` bez `LIKE`, confidential ACL uključujući break-glass. Nema petlje po tiketu ni N+1 upita.
- Export koristi isti builder (filtriranje više nije u memoriji); `filter-export-tickets.ts` i `matches-list-search-query.ts` uklonjeni.
- In-memory Prisma izvršava generisani `where` (AND/OR/NOT, relacije, `skip/take`, sort po relaciji) i baca grešku za nepodržan operator.

## 2026-09-21 — F1 sloj 4 (counts)
- `GET /tickets/counts`: `{ open, unrouted, inbox, overdue, atRisk, byStatus }` nad istom vidljivošću i filterima kao lista; opcioni filteri za tab brojače (LST-03).
- Inbox predikat izdvojen (`buildGroupInboxWhere`), paritet sa starom petljom u specu. `TicketFilterQueryDto` je zajednička baza za listu i counts.
- FE: `getTicketCounts` + `toTicketCountsSearchParams`; sidebar značke (`use-sidebar-ticket-counts`) više ne preuzimaju cijelu listu i inbox.
