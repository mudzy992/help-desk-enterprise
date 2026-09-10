# Domain Model — EP-HelpDesk

Source of truth: `backend/prisma/schema/` (Prisma 7, PostgreSQL). This file is a map, not a substitute for the schema.

OrganizationalUnit is a single self-referencing tree (`parentId` / `children`). Never split OU levels into separate tables.

## Domains

1. **Organization** — `OrganizationalUnit`
2. **Identity & access** — `User`, `Role`, `Permission`, `RolePermission`, `UserRole` (optional OU/service scope), `Group`, `GroupMember`, `PolicyPack`
3. **Catalog & routing** — `ServiceCategory`, `Service`, `ServiceDowntimeWindow`, `FormVersion`, `RoutingRule` (`originUnit + service → group`, `isFallback`), `PriorityMatrixRule`, `ChangeLog`
4. **Ticketing** — `Ticket` (`formVersionId`, parent/split/merge/reopen links, confidential flag), `TicketParticipant`, `TicketMessage`, `TicketActivity`, `TicketTimeLog`, `TicketAttachment` (classification inheritance fields), `TicketApproval`, `CloseCode`, `SavedView`, `TicketCsat`, `TicketConfidentialGrant`, `BreakGlassEvent`
5. **Knowledge** — `KnowledgeArticle` (`tsvector` + GIN), `KnowledgeFeedback`
6. **SLA** — `BusinessHoursCalendar`, `CalendarHoliday`, `SlaProfile`, `SlaRule`, `TicketSlaState`, `SlaEscalationRule`
7. **Ops** — `Notification`, `AuditLog` (hash chain), `IntegrationJob`, `ConfigVersion`, `AppSetting`

Ticket assignment lives on `Ticket.assignedGroupId` / `assignedUserId`. Separate assignment-audit entities are not part of this schema.
