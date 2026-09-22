# CHANGELOG — ticket-group-inbox

## 2026-09-11
- Group inbox (`GET /tickets/inbox`), claim/take-over (`POST /tickets/:ticketId/claim`) i server-side auto-assign Least Busy / Round Robin. Eligible agenti su samo scoped članovi handler grupe. Nema eligible agenta → tiket ostaje u inboxu. Routing engine nije diran.

## 2026-09-21
- Claim je atomičan (uslovni `updateMany` na `assignedUserId: null` + pročitani status). Uklonjen take-over kroz claim (INB-07): tuđi tiket vraća `TICKET_NOT_CLAIMABLE` (HTTP 409, ranije 400) s `details.claimedByName`. Preuzimanje tuđeg tiketa ostaje samo kroz „Dodijeli“ (bulk `assign_user`).
- Odstupanje od `04-FAZNI-PLAN` (zadatak 8): guard nije samo `PENDING`. Zadržani su `ASSIGNED`/`IN_PROGRESS` uz `assignedUserId: null`, jer bulk „Dodijeli grupi“ ostavlja takav tiket i on mora ostati preuzimljiv.
- Inbox predikat izdvojen u `buildGroupInboxWhere` (dijele ga `GET /tickets/counts` i, u sljedećem sloju, `GET /tickets/inbox`). Ponašanje nepromijenjeno; paritet čuva `build-group-inbox-where.spec.ts`.

## 2026-09-21 (sloj 5)
- Inbox dobija paginaciju, `groupId` i sort po najbližem SLA roku; stara petlja po tiketu (`isInboxTicketVisible`) zamijenjena `buildGroupInboxWhere` (nepromijenjena pravila, paritet u `build-group-inbox-where.spec.ts` sad provjerava i paginiranu funkciju stranicu po stranicu).
- Novi `GET /groups/mine` (D2 = auto-assign po grupi): `{ id, name, organizationalUnit {id,name,path}, memberCount, effectiveAutoAssign, isFallback }`, role USER/AGENT/ADMIN/SUPER_ADMIN, samo grupe u kojima je pozivalac član (SuperAdmin: sve). Zaseban `GroupsMineController` na `groups/mine`, registrovan ispred `GroupsController` (isti razlog kao `TicketsSavedViewsController` ispred `TicketsController`).
- `Group.autoAssignStrategy` (nova kolona, `AutoAssignStrategy @default(NONE)`); `resolveEffectiveAutoAssignStrategy` sad prima i `groupStrategy`, prioritet grupa > servis > globalno. `effectiveAutoAssign` u `/groups/mine` računa se bez `serviceStrategy` (grupa opslužuje više servisa preko routing pravila; servisni nivo se primjenjuje tek kad je tiket stvarno rutiran).
- **Migracija nije generisana u ovom okruženju** (nema Postgres konekcije): pokrenuti `npx prisma migrate dev --name group-auto-assign-strategy` prije deploya.
