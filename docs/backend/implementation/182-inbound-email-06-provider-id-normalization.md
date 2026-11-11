# BA-inbound-email-06: ista normalizacija provider ID-a za lookup i store

Status: **zatvoreno** (operativna potvrda korisnika: nema trajno preskočenih poruka, 24h brojevi normalni).  Kumulativni CI `42805826360` za commit `806ccdd` prošao je uspješno (generated Prisma + stvarni PostgreSQL). Lookup postojećeg reda koristio je puni `providerMessageId`, a store ga je rezao na 500 znakova (granica `VarChar(500)` kolone).

## Prethodno ponašanje

Za provider ID duži od 500 znakova (npr. dugi Graph ID-jevi) lookup nikada ne pronađe već pohranjeni red: svaki poll pokuša novi `create`, udari u unique ograničenje `(mailboxKey, providerMessageId)` i poruka se preskoči — uključujući završene poruke kojima je samo `move` trebao retry i istekle `PROCESSING` claimove koji se nikada ne mogu ponovo preuzeti. Poruka trajno ostaje u pretincu bez obrade.

## Mehanizam

- `normalizeInboundProviderMessageId` u `inbound-email-attempt.ts` jedino je mjesto normalizacije (rez na 500).
- Store u `claimInboundEmailAttempt` i lookup u `InboundEmailService.handleItem` koriste isti normalizovani identitet.
- Mailbox operacije (`session.move`) i dalje koriste originalni puni provider ID, jer konektorima treba stvarni identifikator.

## Ograničenja

Dva različita provider ID-ja koja dijele prvih 500 znakova i dalje bi se sudarila u isti durable identitet; to je granica postojeće kolone bez migracije na duži tip. Graph/IMAP ID-jevi u praksi su znatno kraći ili se razlikuju prije 500 znakova, ali dokaz na stvarnim dugim ID-jevima nije prikupljen. Kumulativni CI `42805826360` za `806ccdd` prošao je uspješno; bez operativne potvrde nalaz se ne zatvara. Deployment nije rađen.
