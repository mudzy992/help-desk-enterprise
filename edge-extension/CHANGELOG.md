# Changelog — EP-HelpDesk Edge ekstenzija

## 1.0.0 — produkcijski rewrite

### Popravljeno (audit nalaza)
- **`opened` receipt padao sa 404** — klik na toast je kao `notificationId`
  slao `eventId` (chrome notification id). Sada se na prijemu eventa pamti mapa
  `eventId → { ticketId, notificationId }` pa receipt uvijek nosi stvarni
  `notification.id`.
- **Polling je mirovao** — `setInterval` unutar MV3 service workera umire sa
  suspendovanim W-om. Zamijenjeno `chrome.alarms` (min 60 s, clamp 60–120 iz
  settingsa) + novi `alarms` permission u manifestu.
- **`connect_error` bez fallbacka** — WS auth/mrežne greške sada uključuju
  polling i signaliziraju "Offline" stanje popupu; HTTP 401 automatski čisti
  sesiju (pristanak na "Sesija je istekla").
- **Nije bilo live osvježavanja popupa** — dodan `chrome.runtime.onConnect`
  port: SW prosljeđuje `status.changed`, `inbox.refresh` i
  `ticket.message.created` (za otvoreni thread) u popup. `ticket:join` se
  ponavlja nakon reconnecta, `ticket:leave` na izlasku iz threada.
- Pozadinska obrada `notification.unread-count` / `notification.read` i
  `readAll` eventova → precizan badge.
- Placeholder ikona (82 bajta) zamijenjena pravom ikonom (16–128) koja se
  koristi i u OS toastovima.

### Novo (UX/UI)
- Kompletan redizajn popupa (380 px): dark glass tema, login hero, status pill
  (WS / Polling / Offline / Modul ugašen), unread pill, pretraga inboxa,
  skeletoni, empty state, chat sa bubble porukama, composer sa Enter-send +
  char counter, prominentna Quick Assist kartica, footer sa verzijom.
- i18n sloj (BS podrazumijevano, EN pripremljeno) + `_locales` za manifest.
- Toastovi sada imaju lokalizirane neutralne naslove po tipu (`remote.requested`
  → "Zahtjev za udaljenu podršku"), gumb "Otvori u Desku",
  `requireInteraction` za remote, i nikad ne prikazuju title/body sadržaj.
- Prečica tastature `Ctrl+Shift+Y` za popup; CSP dopust; `author`,
  `short_name`, pune ikone u manifestu.

### Ojačano
- HTTP klijent: 15 s timeout, sigurno parsiranje tijela, mapiranje mrežnih
  grešaka, tipiziran `HelpdeskHttpError` (status + code).
- Inbox sortiran po `updatedAt` desc, enrichovan `priority`/`updatedAt`
  poljima, defanzivno parsiranje odgovora.
- Dokumentacija (`README.md`) sa preduvjetima, load-unpacked uputstvom i
  troubleshooting matricom.
