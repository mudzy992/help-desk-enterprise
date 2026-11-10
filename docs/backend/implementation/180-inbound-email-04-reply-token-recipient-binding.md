# BA-inbound-email-04: potpisani reply token vezan za primaoca

Status: **otvoreno**. Potpisani reply token nosi `recipientId` korisnika kojem je notifikacijski e-mail poslan, ali se pri dolaznoj obradi ta vrijednost nije poredila sa stvarnim pošiljaocem — token je služio samo za rutiranje na tiket.

## Prethodno ponašanje

`processInboundMessage` je rješavao metu (`token` → `thread` → subject broj → novi tiket) i upisivao odgovor pod identitetom pošiljaoca pronađenog po e-mail adresi. Ko god posjeduje proslijeđeni token (proslijeđena pošta, dijeljeni pretinac, izvučeni `Message-ID` zaglavlja) mogao je usmjeriti vlastiti odgovor na tuđi tiket, iako je token izdat drugom primaocu.

## Mehanizam

- Nakon što se pošiljalac razriješi u aktivnog korisnika i meta se razriješi kao `token`, obrada odbija poruku novim razlogom `TOKEN_RECIPIENT_MISMATCH` ako `target.recipientId !== sender.id`.
- Odbijanje ne nosi `ticketId`, pa odgovor ne potvrđuje da tiket postoji; ne pozivaju se ni lookup tiketa ni `addReply`/`reopenWithReply`.
- Token i dalje samo rutira — autentikacija pošiljaoca ostaje na postojećim granicama (`findSenderByEmail`, aktivnost, domena i opciono `requireAuthPass` iz BA-inbound-email-02).

## Ograničenja

Strogo poklapanje znači da primalac koji odgovara s druge adrese (alias koji se ne mapira na istog korisnika kroz `findSenderByEmail`) biva odbijen i mora odgovoriti s izdate adrese ili kroz aplikaciju. Thread/subject rute bez tokena nisu mijenjane i dalje se oslanjaju na pristup koji ticket servis provjerava pri upisu. Nema migracije; razlog odbijanja pohranjuje se kao string u postojeći zapis dolazne pošte. Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde nalaz se ne zatvara. Deployment nije rađen.
