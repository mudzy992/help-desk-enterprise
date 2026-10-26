# W5.11 — Remote request atomska i bounded rate-limit granica

**Finding:** `BA-tickets-11`  
**Implementacija:** `04e909b`, test-harness korekcija `1447ef3`  
**CI:** `40322188627` — zelen

## Problem

Remote request je čitao sve system evente i tek ih zatim filtrirao u memoriji. Provjera posljednjeg zahtjeva i upis novog eventa bili su odvojeni, pa su paralelni zahtjevi mogli svi proći isti rate-limit prozor.

## Implementirani ugovor

- query sada filtrira `ticketId`, `SYSTEM_EVENT` tip i tačan `ticket_remote_requested` action direktno u PostgreSQL-u;
- čita se samo najnoviji zapis determinističkim `createdAt DESC, id DESC` redoslijedom;
- provjera prozora i insert novog remote-request eventa izvršavaju se u jednoj transakciji;
- stabilni parent ticket red zaključava se sa `SELECT ... FOR UPDATE`, čime se zahtjevi za isti ticket serijalizuju, dok različiti ticketi ostaju nezavisni;
- lock se automatski oslobađa commitom ili rollbackom, bez nove periodične cleanup obaveze;
- postojeći servis objavljuje realtime poruku samo za committed pobjednički zahtjev.

## Direktni dokaz

`remote-rate-limit.integration.spec.ts` na stvarnom PostgreSQL-u paralelno pokreće 12 zahtjeva za isti ticket i potvrđuje tačno jedan uspjeh, 11 rate-limit odbijanja i tačno jedan persisted `ticket_remote_requested` event.

Puni CI `40322188627` je zelen za backend build/lint/unit testove, stvarne PostgreSQL/Redis integration suiteove, frontend, docs i container/supply-chain provjere. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**. Atomska granica koristi postojeći ticket red i postojeći `TicketMessage` indeksni/query ugovor.

## Ishod

`BA-tickets-11` je zatvoren. Registar prelazi na **645 otvorenih / 47 zatvorenih / 692 ukupno**.
