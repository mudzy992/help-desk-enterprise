# Domain Model — EP-HelpDesk

Source of truth: `backend/prisma/schema/` (Prisma 7, PostgreSQL). This file is a map, not a substitute for the schema.

OrganizationalUnit is a single self-referencing tree (`parentId` / `children`). Never split OU levels into separate tables.

Identity fields on an OU are distinct:

- `name` — display name of this unit only (path segment; no `/`, `\`, or `,`)
- `distinguishedName` — directory DN (LDAP), unique, canonicalized (`OU=` / `DC=`). Source-of-truth for directory membership. A child DN must be a descendant of its parent's DN.
- `ouPath` — canonical application hierarchy path (`/Korisnici/Direkcija/...`), unique, derived from the parent chain + `name`. This is the application tree identity, not a second directory.

A user has at most one primary OU (`User.organizationalUnitId`). Deleting an OU is rejected while children or mapped users still exist; there is no silent orphaning or cascade of the tree.

## Domains

1. **Organization** — `OrganizationalUnit`
2. **Identity & access** — `User`, `Role`, `Permission`, `RolePermission`, `UserRole` (optional OU/service scope), `Group`, `GroupMember`, `PolicyPack` (IT/HR/Finance registry applies additive `UserRole` grants; never SuperAdmin)
3. **Catalog & routing** — `ServiceCategory`, `Service`, `ServiceDowntimeWindow`, `FormVersion`, `RoutingRule` (`originUnit + service → group`, `isFallback`), `PriorityMatrixRule`, `ChangeLog`
4. **Ticketing** — `Ticket` (`formVersionId`, parent/split/merge/reopen links, confidential flag), `TicketParticipant`, `TicketMessage`, `TicketActivity`, `TicketTimeLog`, `TicketAttachment` (classification inheritance fields), `TicketApproval`, `CloseCode`, `SavedView`, `TicketCsat`, `TicketConfidentialGrant`, `BreakGlassEvent`
5. **Knowledge** — `KnowledgeArticle` (`tsvector` + GIN), `KnowledgeFeedback`
6. **SLA** — `BusinessHoursCalendar`, `CalendarHoliday`, `SlaProfile`, `SlaRule`, `TicketSlaState`, `SlaEscalationRule`
7. **Ops** — `Notification`, `AuditLog` (hash chain), `IntegrationJob`, `ConfigVersion`, `AppSetting`

Ticket assignment lives on `Ticket.assignedGroupId` / `assignedUserId`. Separate assignment-audit entities are not part of this schema.
