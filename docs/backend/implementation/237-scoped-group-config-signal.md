# Scoped invalidacija administracije grupa

**Status:** implementacija za grupe; nije closeout paketa 228 ni podrška drugim admin domenama. Nema migracije niti promjene globalne `role:admins` sobe.

## Mehanizam i sigurnosni ugovor

- Uspješne create/update/delete/add-member/remove-member operacije `GroupsService` objavljuju interni OU signal. Kod brisanja OU se uzima iz obrisanog zapisa u istoj transakciji kao audit i delete te vraća tek nakon uspješnog commita; HTTP 204 i članovi se ne mijenjaju. Ne koristi se klijentski naveden scope niti naknadni lookup obrisane grupe.
- Svaka Socket.IO instanca obrađuje samo svoje lokalne socketove. Druga instanca prima interni OU ID preko postojećeg Redis Socket.IO server-side kanala; ID se ne šalje browseru. Redis adapter i njegovi kanali ostaju dio pouzdane infrastrukture. Nema širenja globalne sobe ili slanja svima pa filtriranja u browseru.
- Za svaki socket prije emitovanja provjerava se trenutna sesija, zatim autoritativni kontekst, te isti `ADMIN` + `groupManage` + OU uslov kao pri `GroupsService.listAccessible`, uz trenutni OU path. Service-scoped dodjela bez odgovarajućeg prava za čitanje grupa se odbija. Missing OU, neaktivni ili opozvani korisnici/sesije i greška provjere ne dobijaju signal. Globalna admin soba dobija postojeći signal, pa se njenim socketima ovdje ne šalje dodatni.
- Browser prima samo `admin.config.updated { domain: 'groups' }`, bez OU, grupe, korisnika, akcije i vremena. Postojeći parser i banner čuvaju nacrt i traže eksplicitni refresh. To je invalidacija, ne dokaz sadržaja, persistencije ili isporuke.

## Regresija i dokazi

Prije izmjene deterministički test očekivao je OU iz committanog delete outcomea i pao jer taj podatak nije vraćen; zaseban test za post-commit scoped publish također je pao zbog nedostajućeg poziva. Testovi pokrivaju neuspjeli commit/delete, scope, dozvoljeni podređeni OU, drugi OU, nedostajuću permisiju, service scope, opozvanu sesiju, neuspjelu provjeru i disconnect tokom provjere. Lokalni Socket.IO test koristi dva stvarna klijenta i provjerava samo autorizovanog primaoca; frontend hook test provjerava očuvanje drafta i eksplicitni refresh. To nisu browser acceptance ni dokaz stvarne Redis mreže. Test za dvije instance sa stvarnim Redis adapterom uključen je u postojeću CI integracijsku suiteu; njegov rezultat zavisi od završetka CI-ja. Lokalno generisanje Prisma klijenta je bilo blokirano TLS pristupom Prisma binary hostu; izolovani lokalni Jest testovi zato su pokrenuti bez TypeScript dijagnostike, a generated-Prisma build provjerava CI.

## Granice

Isporuka je best-effort: proces može stati nakon commita, dodatni lookup nakon ostalih mutacija može zakazati, interna Redis poruka ili signal mogu biti izgubljeni, a connect ne dokazuje zdravlje adaptera. Nema durable replaya. Po instanci se obrađuje do 20 socketova istovremeno i najviše 100 različitih OU-ova čeka u redu, uz coalescing; preko limita novi signal se odbacuje uz upozorenje. Spora autorizacijska provjera može zadržati red; broj provjera raste s brojem lokalnih socketova. Session i autorizacija nisu atomski povezani sa samim emitom: opoziv ili promjena OU hijerarhije nakon provjere i dalje mogu utrkivati sa slanjem minimalnog signala. Greške autorizacijskih dohvata ne otvaraju pristup. Postojeći reconnect banner i ručni REST refresh ostaju fallback, ali ne garantuju oporavak nakon tihog gubitka na zdravoj konekciji.

Bez zasebnih dokaza ne tvrditi pokrivenost routing, SLA, catalog ili templates; njihova pravila scopea i rollback putanje razlikuju se. Korisnikovo okruženje bez OU dodjela po osobi možda ne omogućava scoped browser acceptance; to ne zamjenjuje negativne determinističke i Redis testove niti dokazuje sve instance/revocation utrke.
