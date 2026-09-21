# MATRIX — ticketing-core

## Cilj
Ticket CRUD na postojećem enterprise modelu (`Ticket`, `formVersionId` kao `formVersionRef`, routing rezolucija, RoleGuard/OU/service scope). Nije group inbox, auto-assign, chat, attachments, SLA, approvals ili ticket workspace UI.

## Create
Ulaz: `title`, `description`, `impact`, `urgency`, `serviceId`, opciono `originUnitId` / `formVersionRef` / `formData`.
`priority` se **ne** prima od klijenta. Računa se samo kroz `calculateTicketPriority`.
`requesterId` je session principal. Ako `originUnitId` nije poslan, koristi se `User.organizationalUnitId`. SuperAdmin i korisnici bez home OU **moraju** poslati `originUnitId`. Create UI uvijek prikuplja origin OU i šalje ga u `POST /tickets`.

Servis mora biti `ACTIVE` (`offeredToRequesters`). Availability/downtime **ne** blokira create.
`formVersionRef` mora pripadati servisu i biti `ACTIVE`. Ako nije poslan, uzima se najnoviji ACTIVE. Persistira se tačan `Ticket.formVersionId`; later form versions ne diraju historijski tiket.

Routing se zove postojećim `RoutingService.resolve` (ne mijenja engine):

| Ishod | Ticket status | `assignedGroupId` | `assignedUserId` |
|---|---|---|---|
| `EXACT` / `PARENT_FALLBACK` | `PENDING` | resolved `groupId` | `null` |
| `UNROUTED` | `UNROUTED` | `null` | `null` |

Nema claiming/auto-assign.

## Read / list / update
List/get: requester vidi svoje tikete; AGENT/ADMIN vidi tikete čiji `originUnit` + `service` pokriva postojeći `UserRole` assignment (isti evaluator kao ostali moduli); SuperAdmin vidi sve.
Update smije: title, description, impact, urgency, formData, status. Ne smije: service, origin, formVersionRef, requester, ticketNumber, priority, assignedGroup/User.
Impact/urgency change ⇒ ponovo `calculateTicketPriority`. Status change ide kroz state machine (workflow-state-machine-guards). Requester ne smije mijenjati status.

## Lista (`GET /tickets`)
Jedan upit-DTO (`ListTicketsQueryDto` → `TicketListQuery`) i jedna funkcija `buildTicketListFilters`, isti vokabular koriste lista, export i CSAT sažetak.

- **Filteri:** `status` (jedan ili više: `status=A&status=B` ili `status=A,B`), `priority`, `serviceId`, `originUnitId`, `assignedUserId`, `requesterId`, `groupId` (= `assignedGroupId`), `unassigned`, `overdue`, `atRisk`, `createdFrom`/`createdTo` (ISO), `q` (broj i naslov, bez opisa; export dodatno traži po opisu), `includeArchived`.
- **`overdue`** = `isResponseBreached` ili `isResolutionBreached` na `TicketSlaState`. **`atRisk`** = nije probijen i (`isResponseAtRisk` ili `isResolutionAtRisk`); probijen tiket je `overdue`, nikad `atRisk` (isto kao `isTicketSlaOverdue`/`isTicketSlaAtRisk`).
- **Arhiva:** bez eksplicitnog statusa skrivena osim uz `includeArchived`. Status `ARCHIVED` vide samo SuperAdmin ili kad je arhiva pretraživa; bez prava se `ARCHIVED` izbacuje iz liste statusa (samo `ARCHIVED` ⇒ prazan rezultat).
- **Sort:** `sort` = `updatedAt|createdAt|priority|status|slaDueAt`, `dir` = `asc|desc`; zadano `createdAt desc` (nepromijenjeno). `priority`/`status` idu po redoslijedu enuma u bazi. `slaDueAt` je `TicketSlaState.resolutionDueAt`; tiket bez roka je na kraju uz `asc`. Uvijek se dodaje `id` kao tie-break da paginacija bude stabilna.
- **Odgovor:** bez `page`/`pageSize` običan niz (prelazni režim za starije klijente: edge ekstenzije, e2e). S `page` ili `pageSize`: `{ items, total, page, pageSize }`, `page` ≥ 1 (zadano 1), `pageSize` 1–100 (zadano 25). `total` broji samo ono što pozivalac smije vidjeti.
- **Vidljivost** je predikat u `where`-u, ne petlja po tiketu (`list/build-ticket-visibility-where.ts`): osnovno pravilo (SuperAdmin / requester / AGENT-ADMIN čiji OU + servis scope pokriva tiket), pa confidential ACL (vidi `ticket-confidential-visibility`). OU scope se računa u aplikaciji istom funkcijom `doesOrganizationalUnitScopeCover` nad učitanim OJ i postaje `originUnitId IN (...)`; namjerno bez SQL `LIKE` nad `ouPath`, jer bi `_` i `%` u nazivu OJ djelovali kao wildcard i proširili scope.

## Nazivi u odgovoru
`TicketResponse` uz id-jeve nosi nazive koje klijent prikazuje, pa UI ne gradi direktorij niti dohvaća katalog: `requesterName`, `assignedUserName`, `assignedGroupName`, `formVersionNumber`, `originUnitName`, `originUnitPath`, `serviceName`. Razrješava ih `loadTicketDisplayLabels` u jednom batch upitu po vrsti za cijeli rezultat (bez upita po tiketu). Nepoznat id daje `null`, nikad sam id.

## Authorization
HTTP: `SessionAuthenticationGuard` + `RoleGuard` + role `USER|AGENT|ADMIN|SUPER_ADMIN`. Nema novih `ticket.create/read/update` permission keyeva. Resource scope se evaluira postojećim `decideAuthorizationAccess` (OU path nasljeđivanje + service scope). Read-only admin mode i dalje ne zaključava ticket create.

## Change log
Uspješan create/update piše postojeći `ChangeLog` (`entityType=ticket`, reason `ticket_create` / `ticket_update`, deterministic diff). Nije AuditLog hash-chain niti TicketActivity.

## API
| Method | Path |
|---|---|
| POST | `/tickets` |
| GET | `/tickets` |
| GET | `/tickets/:ticketId` |
| PATCH | `/tickets/:ticketId` |

## Namjerno NIJE
Group inbox, auto-assign, participants, messages, time tracking, attachments, KB, SLA, approvals, notifications, full ticket workspace, delete endpoint, priority override. Confidential ACL: `ticket-confidential-visibility`.
