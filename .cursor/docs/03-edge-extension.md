# Edge ekstenzija (Faza 9)

Manifest V3 companion klijent (`edge-extension/`). Isti Socket.IO handshake (`handshake.auth.token`) i `user:{userId}` kanal. Matrice: `.cursor/docs/matrices/edge-extension-client/` + `.cursor/docs/matrices/edge-extension-chat-remote-contract/`.

F9-1: WS + polling fallback, redacted toasts, receipts/dedup.

F9-2: popup mini inbox + quick reply (`USER_REPLY`) + Request Remote. Agent šalje `POST /tickets/:ticketId/remote-requests`. Extension prikazuje “Open Quick Assist” tek nakon `remote.requested` notifikacije; klik otvara `ms-quick-assist:` i šalje audit ack. Attachments u extension chatu ostaju isključeni.

Token: memorija / `chrome.storage.session`. Load unpacked: `edge-extension/dist` nakon `npm run build`. SuperAdmin mora `private.edgeExtension.killSwitchEnabled=false` i `private.addons.edge=true`.
