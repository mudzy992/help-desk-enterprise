# EP-HelpDesk — Edge ekstenzija (F9)

Manifest V3 companion klijent za EP-HelpDesk. Radi na **istim Socket.IO kanalima**
(`handshake.auth.token`, soba `user:{userId}`) kao web aplikacija — bez novog
gatewaya i bez novih WS event imena.

## Funkcionalnosti

| Funkcija | Opis |
|---|---|
| Prijava | `POST /auth/login` (local_dev auth). Token nikad ne napušta memoriju service workera i `chrome.storage.session`. |
| Bootstrap | `GET /edge-extension/bootstrap?extensionVersion=` — poštuje kill switch, addon/modul flagove, verziju i domen. |
| Notifikacije | WS `notification.created` (isti envelope kao web) + dedup po `eventId`. |
| Polling fallback | `chrome.alarms` (MV3-sigurno) na `pollingFallback.intervalSeconds` (clamp 60–120 s) kad WS padne ili je `ws.enabled=false`. |
| Toasts | Uvijek redacted: lokaliziran neutralan naslov + broj tiketa. Nikad `title`/`body` sadržaj. Klik ili gumb → Open in Desk + `opened` receipt. |
| Receipts | `POST /edge-extension/receipts` (`delivered`/`opened`, idempotentno, AuditLog). |
| Badge | Nepročitane notifikacije na toolbar ikoni (`notification.unread-count` + poll). |
| Mini inbox | `GET /tickets`, samo tiketi gdje je korisnik `requesterId`, status ∉ `{CLOSED, ARCHIVED}`; prioritet/status chipovi, pretraga. |
| Quick reply | `POST /tickets/:ticketId/messages` `{ type: USER_REPLY }`; staff tipovi (`INTERNAL_NOTE`, `SYSTEM_EVENT`, `APPROVAL_DECISION`) se filtriraju i na klijentu. Cap zadnjih N poruka. |
| Live chat | `ticket:join` dok je thread otvoren; `ticket.message.created` stiže uživo u popup (SW → popup port). |
| Request Remote | Agent šalje zahtjev iz Deska; korisnik u popupu vidi CTA **samo** kad postoji pending `remote.requested`. Klik otvara `ms-quick-assist:` i šalje audit ack. |

## Preduvjeti (backend)

Ekstenzija je tihi klijent — sve "pustio/nije pustio" odlučuje server:

- `private.addons.edge = true`
- `private.edgeExtension.enabled = true`
- `private.notifications.edge.enabled = true`
- `private.edgeExtension.killSwitchEnabled = false` (SuperAdmin)
- (`private.edgeExtension.allowedEmailDomain` i `minClientVersion` po potrebi)
- `CORS_ORIGIN` CSV mora sadržavati i desk origin i `chrome-extension://<id>`
- `APP_PUBLIC_URL` — koristi se kao "Open in Desk" baza

## Razvoj

```bash
cd edge-extension
npm install
npm run build       # tsc --noEmit && vite build
npm run dev         # watch rebuild
```

Učitavanje u Edge: `edge://extensions` → *Developer mode* → **Load unpacked** →
odaberite `edge-extension/dist`.

Verziju drži sinhronizovanom na tri mjesta: `package.json`,
`public/manifest.json` i `extensionVersion` u `src/lib/extension-messages.ts`.

## Arhitektura

```
popup (React-free, 380px)         service worker (background.js)
  login / inbox / thread            edge-session (orkestrator)
        │  chrome.runtime.sendMessage / Port
        ▼                              ▼
   ui-strings (bs/en)            socket.io-client → WS user:{userId}
                                 chrome.alarms  → GET /notifications?unreadOnly=true
                                 chrome.notifications → OS toast (redacted)
                                 chrome.action badge → unread count
```

- `src/lib/*` — čisti moduli (HTTP, WS, dedup, receipts, pending remote, bridge).
- `src/popup/*` — DOM rendereri po view-u (login / inbox / thread) + ikone.
- Token: memorija SW + `chrome.storage.session`. **Nikad** `localStorage` /
  `chrome.storage.local` (local čuva samo API base URL).
- MV3: nema `setInterval` logike u SW-u — polling je na `chrome.alarms`.

## Troubleshooting

| Simptom | Uzrok |
|---|---|
| "Modul je ugašen (KILL_SWITCH)" | SuperAdmin mora postaviti `private.edgeExtension.killSwitchEnabled=false`. |
| Toast-ovi stižu duplo | Ne bi smjeli — dedup je po `eventId`; provjerite da producer i WS nose isti id. |
| Polling ne radi u pozadini | Sve je na `chrome.alarms`; provjerite da manifest ima `alarms` permission. |
| WS se odmah odbije | CORS: desk origin + `chrome-extension://<id>` u `CORS_ORIGIN`; token u `handshake.auth.token`. |
| "Open in Desk" ne radi | `APP_PUBLIC_URL` nije postavljen na backendu. |
