# Domain Model — sažetak (za pun Prisma schema vidi prisma/schema.prisma)

6 domena:
1. **Organizational Structure** — `OrganizationalUnit` (self-referencing tree: DIRECTORATE → BRANCH → OFFICE → SECTOR → SERVICE)
2. **Identity & Access** — `User`, `Role`, `Group`, `GroupMember`
3. **Ticketing** — `Ticket`, `TicketActivity`, `TicketTimeLog` (napomena: SRS pominje i TicketAssignment kao zaseban entitet — u MVP schema-i assignment se prati direktno na Ticket-u preko assignedGroupId/assignedUserId; TicketAssignment kao zaseban audit-log entitet je Faza 2)
4. **Knowledge Base** — `KnowledgeArticle`, `KnowledgeFeedback`
5. **Routing & Configuration** — `Service`, `ServiceCategory`, `RoutingRule`
6. **System & Audit** — `Notification`, `AuditLog`

Ključna arhitektonska odluka: OrganizationalUnit je JEDNA tabela za cijelu hijerarhiju (Direkcija/Podružnica/Poslovnica/Sektor/Služba) preko `parentId`/`children` self-relacije. Nikad ne praviti zasebne tabele po nivou.

Kompletna Prisma šema (svi modeli, enumi, relacije) je već definisana i treba je prekopirati direktno u `prisma/schema.prisma` u Fazi 0 (scaffold) — ne treba je ponovo generisati kroz agenta, samo primijeniti.
