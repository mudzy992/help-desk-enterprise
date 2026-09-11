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
3. **Catalog & routing** — `ServiceCategory`, `Service` (`id` + unique `slug` are identity; `lifecycle` is catalog publish state only; `availability` is admin-set runtime status, overlaid by `ServiceDowntimeWindow` `[startsAt, endsAt)` and never blocks ticket creation), `FormVersion` (`id` is the persisted `formVersionRef`; schema JSON is immutable once the version is ACTIVE/RETIRED or referenced by a ticket), `ServiceOnboarding` (wizard workflow state, separate from `Service.lifecycle`; one per service; stores exact `formVersionRef` plus opaque routing/SLA/approvals configuration refs), `RoutingRule` (unique `originUnit + service → group`; parent fallback walks the OU `parentId` chain at resolution time; no match is first-class `UNROUTED`, never an arbitrary group), `PriorityMatrixRule`, `ChangeLog` (successful settings and routing mutations: caller `reason` + deterministic before/after diff; secrets redacted; not `AuditLog` hash-chain or `ConfigVersion`)
4. **Ticketing** — `Ticket` (`formVersionId` stores `formVersionRef` and is resolved by exact id, never latest; parent/split/merge/reopen links, confidential flag; `closeCodeId` + `resolutionNote` set on resolve/close from the settings allow-list), `TicketParticipant`, `TicketMessage`, `TicketActivity`, `TicketTimeLog`, `TicketAttachment` (disk path + MIME/ext metadata, `uploadedByUserId`, classification inheritance from the parent ticket), `TicketApproval`, `CloseCode` (global allow-list keys plus optional per-service rows), `SavedView`, `TicketCsat`, `TicketConfidentialGrant`, `BreakGlassEvent`
5. **Knowledge** — `KnowledgeArticle` (lifecycle `DRAFT` / `IN_REVIEW` / `PUBLISHED` / `ARCHIVED`, `DataClassification`, required `serviceId` + `organizationalUnitId`, owner user XOR owner group, optional `reviewerUserId`, `reviewDueAt` / `lastReviewedAt` / `publishedAt` / `isStale`, Postgres `tsvector` + GIN), `KnowledgeFeedback` (one current vote per user per article; `isHelpful` upsert)
6. **SLA** — `BusinessHoursCalendar`, `CalendarHoliday`, `SlaProfile`, `SlaRule`, `TicketSlaState`, `SlaEscalationRule`
7. **Ops** — `Notification`, `AuditLog` (hash chain), `IntegrationJob`, `ConfigVersion`, `AppSetting`

Ticket assignment lives on `Ticket.assignedGroupId` / `assignedUserId`. Separate assignment-audit entities are not part of this schema.
