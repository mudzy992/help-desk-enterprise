# BA-on-call-09: sweep scheduler se obnavlja nakon gubitka Redisa

Status: **zatvoreno** (operativna potvrda korisnika: nakon restarta Redisa `on_call_sweep_schedule_recovered` u worker logu unutar 60 s, sweep nastavio bez restarta workera). Automatski CI `42873496502` za commit `7300f65` prošao je uspješno (generated Prisma + stvarni PostgreSQL/Redis). `OnCallSweepSchedulerService` je repeatable sweep scheduler registrovao samo u `onModuleInit`, pa bi Redis flush ili failover na praznu instancu trajno zaustavio on-call sweep (reminderi, shift-start i gap obavještenja) do sljedećeg restarta workera — isti obrazac koji je za inbound e-poštu riješen u BA-inbound-email-08.

## Izmjena

Scheduler sada, po uzoru na inbound scheduler, svakih 60 sekundi (`unref` timer, čišćenje u `onModuleDestroy`) provjerava postoji li `onCallSweepSchedulerId` među BullMQ job schedulerima; ako nedostaje, ponovo ga registruje `registerRepeatableJob` helperom i loguje `on_call_sweep_schedule_recovered`. Greška provjere se loguje kao `on_call_sweep_schedule_reconcile_failed` i ne ruši worker.

## Testovi i granice

Novi spec pokriva: scheduler prisutan (no-op), scheduler izgubljen (obnova istim ID-jem), init registraciju i cleanup timera. Stvarni Redis-loss scenarij na ciljnoj infrastrukturi nije izveden; automatski CI `42873496502` za `7300f65` prošao je uspješno, ali bez operativne potvrde nalaz se ne zatvara. Migracija nije rađena.
