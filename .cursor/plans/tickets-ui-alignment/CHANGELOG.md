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

## 2026-09-21 — F1 sloj 5 (inbox + /groups/mine)
- Inbox: `list/list-group-inbox-tickets.ts` zamjenjuje staru petlju; paginacija, `groupId`, sort po SLA roku, isti `buildGroupInboxWhere` kao counts. `TicketsService.listInbox` i kontroler sad vraćaju `{ items, total, page, pageSize }`.
- `GET /groups/mine`: `GroupsMineController` (nova ruta `groups/mine`, dozvoljena USER/AGENT/ADMIN/SUPER_ADMIN), `listMyGroups`, `MyGroupResponse`.
- `Group.autoAssignStrategy` dodano u schemu; `resolveEffectiveAutoAssignStrategy` prošireno na prioritet grupa > servis > globalno; `apply-ticket-auto-assignment.ts` čita i grupinu strategiju.

## 2026-09-21 — F1 sloj 6 (routing preview, approvalSteps, realtime)
- `POST /tickets/routing-preview`: `{ outcome, groupName, fallbackDepth, autoAssign, approvalSteps, slaProfileName }`, isti resolver kao create, gated istim `assertCanCreateTicket`. SLA profil se pokazao nezavisnim od prioriteta (vezan za servis), pa preview ne treba prioritet u zahtjevu.
- `ServiceResponse.approvalSteps` (0|1): `GET /services`, `GET /services/:id` nose stvarnu approvals konfiguraciju; mutacioni pozivi koriste konfiguraciju bez overlay-a (dokumentovano ograničenje).
- Realtime (zadatak 11): provjereno, `priority`/`assignedGroupId` već prisutni na `ticket.updated`, uključujući kreiranje. Nema izmjene koda.
