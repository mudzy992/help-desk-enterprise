# Edge ekstenzija (Faza 9)

Manifest V3 companion klijent (`edge-extension/`). Isti Socket.IO handshake (`handshake.auth.token`) i `user:{userId}` kanal. Matrica: `.cursor/docs/matrices/edge-extension-client/`.

F9-1 (ovaj task): WS + polling fallback, redacted toasts, receipts/dedup, minimalni popup (login + Open in Desk).

F9-2: mini inbox, quick reply, Request Remote / Quick Assist.

Token: memorija / `chrome.storage.session`. Load unpacked: `edge-extension/dist` nakon `npm run build`. SuperAdmin mora `private.edgeExtension.killSwitchEnabled=false` i `private.addons.edge=true`.
