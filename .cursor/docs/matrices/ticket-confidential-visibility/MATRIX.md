# MATRIX — ticket-confidential-visibility

## Cilj
Per-ticket ACL za `isConfidential` tikete, poruke i priloge. Koristi postojeći `decideAuthorizationAccess` (role + `confidential.break_glass` + OU/service scope). Nije paralelni authorization engine.

## Vidljivost (kad je ACL uključen)
Tiket, poruke i prilozi su vidljivi samo:

| Actor | Uvjet |
|---|---|
| Requester | `requesterId` |
| Assignee | `assignedUserId` |
| Handler grupa | član `assignedGroupId` |
| Explicit participant | `TicketParticipant.userId` |
| Grant | `TicketConfidentialGrant` user ili grupa |
| Allowed viewer role/group | settings CSV **i** postojeći OU+service ticket scope |
| Break-glass | aktivni `BreakGlassEvent` + permission + role allow-list |

SuperAdmin **nema** implicitan pristup sadržaju. Liste i pretraga ne vraćaju tiket (ni naslov/opis) dok ACL ne dozvoli.

## Break-glass
`POST /tickets/:ticketId/break-glass` `{ reason }`. Permission `confidential.break_glass` kroz postojeći evaluator (OU+service). Role iz `breakGlassAllowedRolesCsv` (default `SUPER_ADMIN`). Razlog obavezan ako je setting uključen. Piše `BreakGlassEvent` (`expiresAt` +1h) + ChangeLog + `SYSTEM_EVENT` `ticket_confidential_break_glass` (action key, bez sadržaja).

Deny na GET: `403 CONFIDENTIAL_ACCESS_DENIED` + `breakGlassAvailable` samo kad actor smije zatražiti break-glass.

## Settings
`private.addons.confidential` i `private.ticket.confidential.*` (RAW ključevi). Ako addon ili `enabled` = false, ACL se ne primjenjuje.

## Audit
ChangeLog: `ticket_confidential_viewed` / `_denied` / `_break_glass`. Diff: `result` + `via`. Bez title/description/message. View audit na `GET /tickets/:id`.

## API
| Method | Path |
|---|---|
| POST | `/tickets/:ticketId/break-glass` |

## Namjerno NIJE
Anti-loop/anti-spam, AuditLog hash-chain, grant CRUD UI, Edge redacted toasts.
