# BA-integration-queue-12: runtime disable kao pauza bez trošenja pokušaja

Status: **otvoreno**. Korisnik je odabrao semantiku pauze prije claima, bez migracije i bez novog statusa: dok je red ili tip runtime-isključen, zakazani posao se ne claimuje, ne troši pokušaj i zadržava svoj retry raspored, a nastavak je automatski kada se tip ponovo uključi.

## Prethodno ponašanje

`IntegrationQueueProcessor` je učitavao postavke samo radi backoff granica, ali ih nije primjenjivao na već zakazane redove: claim je odmah povećavao `attempts` i posao se dispatchovao bez obzira na `private.integrations.queue.enabled` i `typesCsv`. Runtime disable zato nije imao učinak na poslove u redu, niti je postojao pauza/resume ugovor.

## Mehanizam

- Processor prije claima radi lagani `findTypeAndStatus` upit (samo `type`/`status`, bez payloada). Ako red globalno nije omogućen ili tip nije u `typesCsv`, vraća se bez claima i bez ikakve mutacije reda te loguje `integration_job_dispatch_paused ... reason=queue_disabled|type_disabled`. Bull posao time završava bez greške; durable red ostaje `PENDING` odnosno `FAILED` sa sačuvanim `nextRetryAt`.
- `IntegrationJobDispatchReconcilerService` sada učitava iste postavke i ne nudi pauzirane tipove BullMQ-u, pa sweep ne vrti isti posao svaki interval; loguje zbirni `integration_job_dispatch_reconcile_paused`. Ako postavke nije moguće pročitati, reconciler fail-closed ne nudi ništa. Karantin isteklih `PROCESSING` claimova radi i dalje neovisno o pauzi, jer je to sigurnosni, a ne dispatch put.
- `IntegrationQueueCoreModule` uvozi `SettingsModule` da reconciler dobije `SettingsService`; nema cikličnih zavisnosti jer settings modul ne ovisi o integration queue.
- Resume je postojeća operatorska akcija: ponovno uključivanje tipa u `typesCsv` (ili reda globalno) — reconciler tada posao ponovo nudi, a processor ga claimuje s istim brojem pokušaja kao prije pauze.

## Ograničenja

Nema zasebnog `PAUSED` statusa niti operatorskog resume dugmeta: pauzirani poslovi u admin prikazu izgledaju kao običan `PENDING`/`FAILED` backlog (BA-10 indikator starosti ih i dalje broji), a razlog pauze vidljiv je samo u worker logu. Prozor između Bull isporuke i provjere postavki rješava processor, pa isporuka koja stigne trenutak prije isključenja još može biti claimovana — pauza nije trenutni kill-switch za claim u letu. Postavke se čitaju po poslu i po sweepu; nema keširanja ni metrike koliko je poslova pauzirano po tipu. Produceri i dalje odvojeno odlučuju hoće li novi posao uopće zakazati (postojeće ponašanje fan-outa nije mijenjano). Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde u stvarnom okruženju nalaz se ne zatvara. Nije pokrenuta migracija ni deployment.
