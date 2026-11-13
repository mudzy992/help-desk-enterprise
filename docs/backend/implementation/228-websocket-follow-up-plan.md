# WebSocket follow-up — provjera i plan

**Status:** implementacija u toku, nije closeout. Ovaj paket ne mijenja historijski owner-directed status Vala 6. Baseline je [reaudit 227](227-websocket-reaudit-live-refresh.md).

## Provjera postojećih mehanizama

| Oblast | Već postoji | Preostala provjera / posao |
| --- | --- | --- |
| Detalj tiketa, revoke i join/snapshot | Backend autorizuje i revalidira sobe; klijent rejoin + REST reload na connect. `use-ticket-realtime.spec.tsx` provjerava pozive, ne njihov redoslijed. | Klijent ne čeka join ack; silent 403/404 ne briše state i snapshot može prepisati događaj. Statički potvrđeno, race/revoke nije ovdje reproduciran. Dodati determinističke reprodukcije i rješenje s ticket identity/generation zaštitom, očuvanjem drafta i vidljivom greškom. |
| Lista/dashboard, reconnect/hidden | React Query catch-up, debounced reload na event. Lista/dashboard ipak čuvaju snapshot u lokalnom stateu. | WR-01 je reproduciran s dva hook testa prije izmjene (0 poziva umjesto 1), popravljeno u ovom paketu. Ostaje stvarni browser/Redis acceptance; konektovan socket sam po sebi ne dokazuje zdrav adapter. |
| Notifikacije | Postoje socket handleri, reconnect refresh vidljivog inboxa, fallback badge polling i test 59. | Moguće prepisivanje eventa starijim responseom statički potvrđeno; nije izvršena deterministička reprodukcija. Dodati deferred snapshot/create/read test, race-safe reconcile i pagination/badge regresije. |
| Admin drugi tab/reconnect/draft | Domena config eventa, visible editing banner i hidden pending. | Same-user event se odbacuje bez identiteta taba, reconnect nema admin catch-up, a hidden→visible reload zaobilazi provjeru editiranja. Statički potvrđeno, realna šteta/draft nije reproducirana. Testirati dva taba, reconnect i dirty dialog prije implementacije sigurnog osvježavanja; scoped adminu ne proširivati globalnu sobu. |
| Integration/browser acceptance | Postoje Redis integration i lokalni outage test, kao i pozitivni E2E 59. | Ne dokazuju sve navedene utrke i recovery pod gubitkom. Planirati determinističke frontend testove i izolovani browser/Redis test, pa korisnik pokreće ciljani/full E2E prema dogovoru. Nema garancije replaya. |

## Prvi implementacijski korak — WR-01

`useTicketCollectionRealtime` sada bilježi promjenu dok je tab skriven te pri povratku raspoređuje jedan debounced `reload` umjesto da samo invalidira query cache. Na `connect` ponovo učitava montiranu projekciju, uključujući prvi connect nakon mogućeg load/join prozora. Vidljivi eventovi koriste isti mehanizam. Timer se pri unmountu čisti; skriven tab ne pokreće mrežni dohvat. Ovo je ciljano poboljšanje za listu i dashboard, ne opći durable replay niti dokaz da je room setup već završen u momentu connecta.

Prije popravke dva nova hook testa pala su na očekivanom nedostajućem `reload` pozivu; poslije popravke zajedno s reconnect/dashboard testovima prošlo je 14/14, frontend TypeScript i ciljani ESLint. Fake socket/unit nije browser/production dokaz. Preostali slučajevi: spori/istovremeni reload, adapter degradacija bez browser disconnecta, join-readiness i runtime end-to-end; ne zatvarati cijeli WR-01 dok nisu obrađeni prema acceptance dogovoru.

## Redoslijed

1. Ticket revoke i join/snapshot: prvo kontrolisana regresija, zatim usklađivanje ack-a i REST/state generacija; ne objavljivati ticket sadržaj u grupnu sobu.
2. Ojačati WR-01 prema realnim room-readiness i failure scenarijima te notification snapshot/event race.
3. Admin: cross-tab/reconnect/hidden sa zaštitom dirty nacrta i konzervativnom global/scoped autorizacijom.
4. Cross-instance/Redis i browser acceptance, dokumentovanje testiranih i netestiranih stanja; nikakvi ručni full CI/E2E, migracija ili deployment bez zasebnog korisnikovog koraka.
