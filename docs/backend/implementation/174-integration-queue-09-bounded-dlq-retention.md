# BA-integration-queue-09: ograničeni DLQ retention

Status: **otvoreno** dok ne postoje generated-Prisma, PostgreSQL race i performance dokazi. BA-integration-queue-08 nije obuhvaćen; ne uvodi se retention ostalih statusa niti nova politika roka čuvanja. **ZATVORENO** — operativna potvrda korisnika: DLQ retention u worker logu svake ~5 s bez grešaka (processed=0, failed=0), postepeno pražnjenje. 

Svaki postojeći scheduled sweep zadržava konfigurirani cutoff i izuzima oba koda nepoznatog ishoda. Odabire najviše 100 najstarijih podobnih redova, stabilno po `updatedAt, id`, samo ID i fencing verziju. Prazan batch ne izvršava DELETE. Prije DELETE ponovo se provjeravaju status, cutoff, izuzeci i odabrani parovi ID/verzija. Tako promjena statusa, datuma ili verzije nakon odabira ne dopušta brisanje ranije odabranog aktivnog posla. Jedan sweep izvršava najviše jedan batch; puni batch loguje moguće zaostajanje, a ostatak se obrađuje u narednim sweepovima. Dva istovremena sweepa mogu odabrati isti batch; pojedinačni DELETE ostaje ograničen i ponovo provjerava uslove.

Dodat je PostgreSQL integration test za više od jednog batcha, očuvanje oba karantina i promjenu stanja između odabira i brisanja. Test zahtijeva testnu bazu i generated Prisma; bez njih nije lokalno izvršen. Lokalne unit provjere koriste stubove. Nema migracije.

## Ograničenja

Ograničenje obuhvata broj odabranih/obrisanih redova po pozivu, ne garantuje ograničen broj pregledanih redova, vrijeme queryja, WAL ili lock time: nema namjenskog indeksa `(status, updatedAt, id)` i nije mjeren plan na velikoj bazi. Dva workera ili ponovljeni jobovi mogu u istom intervalu ukupno obrisati više od jednog batcha. Retention zaostaje ako priliv premaši kapacitet; log upozorenja nije metrika starosti ni alarm. Potrebni su performance/load i operativni dokaz, te generirani Prisma/PostgreSQL test prije zatvaranja nalaza. Nepoznati ishodi ostaju trajno izuzeti do posebne politike razrješenja.
