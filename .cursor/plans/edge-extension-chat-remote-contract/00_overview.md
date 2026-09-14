# F9-2 — Quick reply + Request Remote — overview

Companion popup (mini inbox, tekstualni quick reply, Open in Desk) + agent-initiated Quick Assist uz durable Edge delivery, rate limit i audit ack.

Matrica: `.cursor/docs/matrices/edge-extension-chat-remote-contract/` (RAW slug). F9-1 matrica ostaje za WS/poll/receipts.

## Dependency (provjereno u kodu)

| Dependency | Stanje |
|---|---|
| F9-1 `edge-extension/` MV3, bootstrap, WS `user:{userId}`, polling, redacted toasts, receipts | **gotovo** |
| F7-A `EDGE_EVENT` queue + Redis subscriber → `TicketRealtimeHub.publishEdgeEvent` | **gotovo** |
| Producer: `enqueueEdgeNotificationEvents` na in-app fan-out | **gotovo** |
| `POST /tickets/:ticketId/messages` + server-side `INTERNAL_NOTE` filter | **gotovo** |
| F8-2 `recordAuditEntry` hash-chain | **gotovo** |
| Chat/remote settings, `ticket.message.send`, `ticket.remote.open_quick_assist`, Request Remote API, popup inbox | **nema** |

## Odluke (predloženo)

1. **Ko inicira remote:** agent/staff. RAW 961–965: *agent klik “Request Remote” → backend kreira record + emituje `remote.requested`*. End-user u extensionu **ne** inicira. Desk UI dobija staff dugme.
2. **Record:** `TicketMessage` `SYSTEM_EVENT` body `ticket_remote_requested` (isti obrazac kao `insert-system-ticket-event.ts`). Nema nove Prisma tabele / migracije. `TicketActivity` se ne koristi nigdje u kodu — ne uvodimo ga ovdje.
3. **Delivery:** mapirati SYSTEM_EVENT → notification type `remote.requested` (email template već postoji) → postojeći fan-out + `EDGE_EVENT` + WS `notification.created`. **Nema** novog Socket.IO event imena (websocket.mdc ostaje). Extension gleda `notification.type === 'remote.requested'`.
4. **Rate limit:** na **agentov** `POST` Request Remote, po `ticketId`, prozor `private.edgeExtension.remote.rateLimitMinutesPerTicket` (default 10). Drugi request u prozoru → `429 REMOTE_RATE_LIMITED`. User ack/open **nije** rate-limit (idempotentan audit). Acceptance “drugi klik” = drugi Request Remote.
5. **`ms-quick-assist:`:** samo na eksplicitan klik. Čak i ako je `requireUserClickToOpenQuickAssist=false`, MVP **ne** auto-otvara protokol.
6. **Guards:** `SessionAuthenticationGuard` + `RoleGuard` USER+ (isto kao messages i F9-1 receipts). **Bez** `OuAccessGuard` — ticket/OU se provjerava u service sloju (`resolveTicketActorAccess` / requester). `RequirePermissions` se **ne** stavlja na rute (OU-scoped assignment lomi unscoped key, F9-1 MATRIX). Katalog i default USER+ grantovi se ipak dodaju.
7. **Inbox:** `GET /tickets` + `GET /auth/session` (`principal.subjectId`). Samo tiketi gdje je user `requesterId`, status ∉ `{CLOSED, ARCHIVED}`. Confidential: postojeći list ACL; 403 na poruke → “no access”.
8. **Quick reply:** `POST /tickets/:ticketId/messages` `{ type: USER_REPLY, body }` (staff u extensionu smije `AGENT_REPLY` po postojećem `normalizeTicketMessageInput`). Client i server filtriraju `INTERNAL_NOTE`. Attachments: setting default false, **nema** upload UI.
9. **Live chat:** na otvoren tiket u popupu `ticket:join`; sluša `ticket.message.created` (public room). Cap `maxMessagesPerTicket` (default 50, zadnjih N).

## Van scope

Attachment upload, content scripts, MSAL, novi gateway, nova Prisma tabela, auto-open Quick Assist, E2E Faza 9 stavka 3, RBAC CI suite, Teams delivery, AI/semantic search.
