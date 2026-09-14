# Faza 3 — Desk dugme + popup inbox/chat + Quick Assist

## Desk (staff)

`frontend/src/components/tickets/ticket-detail-header-actions.tsx` (~L46): “Request Remote” vidljivo kad je actor staff (`canChangeStatus` / postojeći staff signal) i remote enabled (session nije settings-aware — čitati `private.edgeExtension.remote.enabled` kroz postojeći settings query ako ga ticket detail već ima; inače backend odbija i UI pokaže grešku).

Novi `frontend/src/services/tickets-remote-api.ts` → `POST /tickets/:ticketId/remote-requests`. i18n BS/EN. Ne dirati attachment panel.

## Extension popup

- `popup.html` / `popup.ts`: poslije logina mini lista, textarea, Open in Desk (per tiket + global), remote CTA **samo** ako postoji pending `remote.requested` (session storage iz SW, ne hardkodovano).
- Split ako `popup.ts` preraste: `popup-inbox.ts`, `popup-chat.ts`, `popup-remote.ts`.
- Inbox refresh: na open `GET /tickets`; WS `notification.created` / `ticket.updated` kroz runtime message SW → popup.
- Poruke: `GET /tickets/:id/messages`, drop `INTERNAL_NOTE`/`SYSTEM_EVENT`/`APPROVAL_DECISION` klijentski; slice `maxMessagesPerTicket`. `chat.enabled=false` → sakrij composer.
- `attachments.enabled` se **ne** renderuje.

## Background

`background.ts` je ~196 linija — **ekstrakt** prije dodavanja. Novi `handle-remote-requested.ts`: toast (postojeći redacted helper, type `remote.requested`) + `chrome.storage.session` pending `{ ticketId, notificationId }`.

Open Quick Assist: `chrome.tabs.create({ url: 'ms-quick-assist:' })` **samo** iz click handlera; zatim `POST .../acknowledge`. Nikad iz `notification.created` listenera.

`manifest.json`: `ms-quick-assist:` ne treba host_permission; `tabs` već implicitan za `chrome.tabs.create` uz `action`. Ako Edge blokira, dodati `"tabs"` eksplicitno — provjera u implementaciji.

## Polling fallback

Unread `GET /notifications?unreadOnly=true` već prolazi `handleNotificationCreated` — remote toast/pending dolazi istim putem.
