# HANDOFF — edge-extension-client (F9-1)

Status: implementirano. Kod spreman. Unpacked load treba ručni Edge korak.

## Urađeno

- TASKS.md F9-1 `[x]`.
- Settings, bootstrap/receipts, eventId, EDGE_EVENT producer, MV3 klijent.

## Otvoreno

- Polaritet `killSwitchEnabled` potvrđen: **A** (`true` = ne konektuj).

## Next

Ručno: `edge-extension` `npm run build`, load unpacked `dist/`, `killSwitchEnabled=false` + `private.addons.edge=true`, CORS CSV + `chrome-extension://<id>`.
