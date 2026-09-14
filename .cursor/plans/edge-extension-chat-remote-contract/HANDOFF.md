# HANDOFF — F9-2

Status: implementacija gotova. TASKS.md ostaje `[~]` dok korisnik ne pregleda i ne commita.

## Urađeno

- Settings + bootstrap: chat/remote flagovi, `subjectId`, attachments default **false**
- Permissions katalog: `ticket.message.send`, `ticket.remote.open_quick_assist` na USER+
- Staff `POST /tickets/:ticketId/remote-requests` → `SYSTEM_EVENT` `ticket_remote_requested` → inbox `remote.requested` (samo requester)
- Rate limit na agentov POST (default 10 min / ticket) → `429 REMOTE_RATE_LIMITED`
- Ack: `POST /edge-extension/remote-requests/:ticketId/acknowledge` + pending GET; audit `ticket.remote.acknowledged`
- Desk: **Request Remote** u header akcijama kad `canChangeStatus`
- Extension popup: mini inbox, quick reply (`USER_REPLY`), Open Quick Assist samo na klik ako je pending
- Testovi: `tickets.remote-request.spec.ts`, rate-limit helper, notification-kind, map-ticket-error

## Nije u scopeu / ručno

- Attachment upload, auto-open Quick Assist, nova Prisma tabela, MSAL, E2E
- Manual: extension reply u web threadu; remote dugme tek nakon server eventa; drugi Request Remote u 10 min = 429
- Rebuild extension (`edge-extension`: `npm run build`) prije unpacked loada
- SuperAdmin: `killSwitchEnabled=false` i `private.addons.edge=true`

## Commit (kad korisnik zatraži)

```
Add Edge popup quick reply and staff Request Remote with rate-limited Quick Assist ack.

Companion chat reuses the ticket message API without attachments; remote requests fan out as remote.requested and require an explicit ms-quick-assist click plus audit.
```
