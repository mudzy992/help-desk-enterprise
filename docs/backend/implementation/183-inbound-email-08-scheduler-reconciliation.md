# BA-inbound-email-08: reconciliation scheduler nakon gubitka Redisa

Status: **otvoreno**. Kumulativni CI `42805826360` za commit `806ccdd` prošao je uspješno (generated Prisma + stvarni PostgreSQL). `InboundEmailSchedulerService` je poll i retention rasporede registrovao samo u `onModuleInit`. Ako Redis nakon starta izgubi sve schedulere (flush, failover na praznu instancu), worker ih nikada ne bi obnovio do restarta — dolazna pošta bi tiho prestala da se obrađuje.

## Mehanizam

- Nakon početne registracije scheduler pokreće `unref` interval od 60 sekundi koji zove `reconcileSchedules()`.
- Reconciliation kroz `getJobSchedulers` provjerava postoje li oba obavezna scheduler ID-ja; nedostajuće ponovo registruje idempotentnim `upsertJobScheduler` i loguje `inbound_email_schedule_recovered id=…`. Greška reconciliationa loguje se kao `inbound_email_schedule_reconcile_failed` bez rušenja workera.
- Početna registracija zadržava postojeće ponašanje: neuspjeh pri startu i dalje obara modul (`inbound_email mandatory schedule registration failed`).
- `onModuleDestroy` čisti timer.

## Ograničenja

Reconciliation zavisi od živog timera u worker procesu; potpuni gubitak procesa i dalje rješava restart/orchestration. Provjera je periodična (do 60 s kašnjenja oporavka), ne event-driven. Isti obrazac nedostaje drugim schedulerima (npr. BA-on-call-09) i ovdje se ne rješava. Kumulativni CI `42805826360` za `806ccdd` prošao je uspješno, ali bez stvarnog Redis-loss testa i operativne potvrde nalaz se ne zatvara. Nije pokrenuta migracija ni deployment.
