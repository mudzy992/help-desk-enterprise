# W6.52 — BA-websocket-09: REST snapshot catch-up on reconnect

**Audit nalaz:** `BA-websocket-09` (P2), [audit 18 §12 — registar](../audits/18-websocket.md#12-registar-nalaza), [§14 — nalaz 09](../audits/18-websocket.md#14-ostali-nalazi-i-korekcije) i [§27 — status](../audits/18-websocket.md#27-w6-52-implementation-status-ba-websocket-09-2026-10-29)
**Scope:** reconnect catch-up za aktivne ticket i notification prikaze preko postojećih REST snapshot/cursor API-ja; bez durable socket replaya ili zatvaranja susjednih nalaza.
**Status:** zatvoreno (2026-10-29) operativnom potvrdom vlasnika uz CI dokaz; vidi audit 18 §30.

## Oporavak nakon reconnecta

- Socket događaji ostaju best-effort. Na reconnect nakon već uspostavljene konekcije `HelpdeskSocketHost` invalidira aktivne `ticketLists`, ticket counts, group inbox, dashboard summary, SLA summary i notifications query projekcije. Invalidation koristi `refetchType: "active"`; ne pokreće refetch neaktivnih ekrana.
- Reconnect dok je tab skriven postavlja catch-up na čekanje; `visibilitychange` ga pokreće tek kada se socket spoji i ekran ponovo postane vidljiv.
- Ticket detail postojeći `useTicketRealtime` callback re-join-a ticket sobu i traži REST detail/messages snapshot na svakom connectu. Novi regression test zaključava taj ugovor.
- `useInboxNotifications` na connectu osvježava unread count. Nakon reconnecta osvježava i prvu REST cursor stranicu samo kada je lista vidljiva (dashboard feed ili otvoren notification panel); čuva trenutni unread filter. Ako se reconnect desi u pozadini, lista se osvježi pri povratku taba. Skriveni bell panel ne pokreće list query.
- REST snapshot predstavlja trenutno stanje, ne replay svakog propuštenog eventa. Nema event ID/sequence, ack, durable log ili resumable event cursor; reconnect ne garantuje historijski redoslijed poruka, a presence ostaje best-effort.

## Ciljani dokaz i granice

- Ciljani frontend Vitest: **3 fajla / 12 testova prošlo** — reconnect query invalidation/visibility, notification list catch-up/visibility, te ticket room rejoin + REST snapshot reload.
- Targeted ESLint i Prettier prošli; frontend `npx tsc -b --pretty false` prošao.
- Docs guard je prošao (**32 stranice / 8 prevoda / 10 provjera**), docs testovi **9/9**, a `git diff --check` je prošao. Full CI/E2E nije ručno pokretan; push-triggered CI rezultat nije provjeren.
- Nema DB/schema/migration promjene. `BA-websocket-09` ostaje **otvoren**, a Val 6 open/closed brojevi se ne mijenjaju dok acceptance ne bude potvrđen.
