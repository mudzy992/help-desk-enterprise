# BA-on-call-10: retention je ograničen i fail-visible

Status: **otvoreno**. On-call retention je brisala stare override/swap redove dvama neograničenim `deleteMany` pozivima, grešku hvatala i samo logovala ime tipa, a sweep je ipak završavao uspješno — veliki backlog je mogao zaključati tabelu, a trajni kvar retencije nije imao nikakav operativni signal.

## Izmjena

Retention sada briše u batch-evima od 500 redova (po `endsAt` uzlazno), najviše 20 batch-eva po tipu i prolazu (10.000 redova), uz `on_call_retention_deleted` log i `on_call_retention_backlog` upozorenje kad cap ostavi ostatak za sljedeći sweep. Greška se više ne guta: loguje se `on_call_retention_failed` i propagira, pa BullMQ posao pada i retrya (attempts=2) i ostaje vidljiv u queue/DLQ pregledu; notifikacije tog sweepa su već persistirane i dedupirane, pa retry ne šalje duplikate.

## Testovi i granice

Novi sweep spec pokriva batch granicu od 500 (500+3 kroz dva delete poziva), cap od 20 batch-eva uz backlog, i propagaciju greške do pozivaoca. Operativna potvrda se u praksi svodi na posmatranje: pri uključenoj retenciji worker log ne smije imati `on_call_retention_failed`. Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde nalaz se ne zatvara. Migracija nije rađena.
