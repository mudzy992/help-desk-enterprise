# EDGE događaji — podrazumijevana izolacija primaoca

**Status:** implementirano i lokalno testirano; CI i acceptance navedeni odvojeno. Dio [228](228-websocket-follow-up-plan.md); slijedi [233](233-edge-notification-recipient-isolation.md).

## Pregled i rizik

`EdgeEventRealtimePublish` ima eksplicitni `userId`, ali generički `eventName` i proizvoljan `data`; parser Redis/queue posla nije dokaz da je payload autorizovan za svakog člana ticket sobe. Nakon ranijeg izuzetka za `notification.*`, drugi EDGE naziv i dalje je slao isti payload u `user:<id>` i `ticket:<id>`. Klijent u obje sobe primao je duplikat, a drugi korisnik u sobi tiketa primao je tuđi payload. Dva ciljana testa (mock soba i dva stvarna lokalna Socket.IO klijenta) pala su prije ispravke za sintetički `edge.ticket.activity`; ne tvrdi se stvarni produkcijski incident niti da je taj sintetički event produkcijski emitovan.

Pregled repozitorija nalazi dva stvarna proizvođača: `enqueueEdgeNotificationEvents` šalje personalizirani `notification.created`, a `tickets-time-tracking.service.ts` šalje `time.timer.changed` vlasniku, bez `ticketId`; frontend ga koristi kao invalidacijski signal. `edge.ticket.activity` pojavljuje se u gateway testovima, ne kao identificiran produkcijski proizvođač. Integration queue administracija izlaže list/retry, ne generički endpoint za proizvoljan enqueue. Istorijski/vanjski proizvođači i potrošači nisu iz ovoga dokazivo isključeni.

## Promjena i kompatibilnost

Svi `EdgeEventRealtimePublish` sada se šalju **samo u adresiranu korisničku sobu**, bez automatskog slanja u zajedničku ticket sobu, bez obzira na naziv i prisustvo `ticketId`. `ticketId` ostaje u poruci za postojeći revalidation fencing i povezivanje; ne mijenja se job schema, queue status, Redis protokol, timer ili uobičajeni ticket message/update broadcast. Event kojem stvarno treba zajednička ticket publika mora imati zaseban, eksplicitno autorizovan i po public/staff vidljivosti klasifikovan ugovor; proizvoljni korisnički `data` ne smije se automatski širiti.

Ovo **mijenja raniji generički ticket-room ugovor**: eksterni ili stari potrošač koji se oslanjao isključivo na taj broadcast za nepoznati EDGE događaj više ga neće dobiti. Repo pretraga ne može dokazati nepostojanje vanjskih potrošača ili starih queued payloadova. Prije deploya vlasnik treba uzeti tu kompatibilnost u obzir; nema potajne tvrdnje da je isporuka dugotrajna. `PUBLISHED_BEST_EFFORT` nije potvrda klijentske isporuke.

## Testni dokaz i ograničenja

Lokalno 7/7 ciljanih testova i ESLint prolaze; dva realna lokalna Socket.IO klijenta dijele ticket sobu, a svaki dobija samo vlastiti sintetički događaj i vlastitu notifikaciju. Testovi pokrivaju i nazive notification read/count i timer. Postojeći gateway mock i socket test prilagođeni su za korisničku sobu bez uklanjanja revocation provjera. Njihovo lokalno izvršavanje zahtijeva generated Prisma, čiji download u ovom sandboxu ne prolazi zbog TLS/mrežnog ograničenja; CI treba izvršiti kompletan backend build/test i integration. Redis outage, vanjski potrošači i browser nisu ovim dokazani. Nema migracije, novog statusa, opcije ili proširenja soba.
