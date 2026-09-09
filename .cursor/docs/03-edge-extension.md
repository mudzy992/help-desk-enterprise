# Edge ekstenzija (Faza 2 — ne implementirati u MVP-u)

Client-side agent (background script + popup UI) koji:
- silent login preko postojeće Azure AD sesije
- toast notifikacije (nova poruka, remote request, promjena statusa)
- lightweight in-app chat prikaz
- iniciranje `ms-quick-assist:` protokola na klik admina
- WebSocket listener, fallback na polling

Sigurnost: token-based (MSAL), nema lokalnog storage-a osjetljivih podataka, sve preko HTTPS-a.

Backend NE smije imati posebnu granu logike za ekstenziju — ona je samo još jedan klijent na istim WebSocket kanalima (vidi `.cursor/rules/websocket.mdc`). Kad se Faza 2 pokrene, ovaj fajl će biti proširen konkretnim taskovima u TASKS.md.
