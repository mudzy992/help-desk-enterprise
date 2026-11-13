# Ticket realtime — djelimična zaštita nakon opoziva pristupa

**Status:** djelimično implementirano; ne zatvara ticket revoke/join iz [plana 228](228-websocket-follow-up-plan.md).

Novi testovi su prije ispravke reproducirali da je tihi refresh s 403/404 ostavljao tiket i poruke na ekranu, dok greška 500 nije prikazivala grešku. `loadTicketDetail` sada na 403/404 čisti tiket, poruke, učesnike i panele te prikazuje grešku; kod prolazne greške čuva prethodne podatke i prikazuje grešku akcije. Ova promjena ne dokazuje da se refresh pokreće odmah nakon svakog opoziva: backend je i dalje odgovoran za autorizaciju i uklanjanje iz soba.

Guard generacije sprečava da odgovor starijeg učitavanja prepiše novije, uključujući nakon promjene tiketa ili unmounta. Zakašnjeli panel ne vraća podatke nakon 403/404 pri čitanju prepiske. Testovi pokrivaju 403/404, 500, stariji odgovor nakon opoziva i zakašnjeli panel. To su unit testovi s mock API-jem, ne browser/Redis acceptance. Ostale asinhrone akcije i stateful komponente zahtijevaju zasebnu provjeru.

**Još nije implementirano:** potvrda socket joina (ack + timeout/odbijanje), čitanje snapshota nakon joina, usklađivanje događaja tokom snapshota i browser/cross-instance dokaz. Ne tvrdi se replay niti uklanjanje svih utrka. Bez migracije, deploymenta i ručnog full E2E.
