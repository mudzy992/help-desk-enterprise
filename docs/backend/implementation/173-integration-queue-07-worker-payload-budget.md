# BA-integration-queue-07: worker payload budget

Status: **otvoreno**. Ovo je djelimična mitigacija, ne potpuna ulazna zaštita. **ZATVORENO** — operativna potvrda korisnika: bez anomalija u radu reda (payload budžet na worker strani, CI dokaz paketa). 

Nakon fenced claim-a, a prije type parsera ili providera, worker iterativno provjerava JSON payload: EMAIL ima konzervativni budžet 2 MiB, EDGE_EVENT 256 KiB, TEAMS 64 KiB; najviše 10.000 čvorova i dubina 16 (root je 0). Budžet broji UTF-8 ključeve i stringove uz konzervativne režijske bajtove; nije identičan dužini JSON serijalizacije. Preveliki, preduboki ili ciklični payload završava odmah u DLQ s kodom `INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED`, bez automatskog retryja ili poziva providera. Kod je sigurno prikazan adminu. Email ledger se pri ovoj grešci ne parsira niti mijenja: potrebna je operativna provjera prije daljnjeg postupanja.

Ove granice mogu odbiti ranije prihvaćene legitimne poslove; nema skraćivanja payloadova. Administratorski retry ne mijenja payload i ponovo će završiti u DLQ ako i dalje prelazi granice. Nije provedena inventura stvarnih produkcijskih veličina niti acceptance svih producenata i postojećeg backlog-a.

## Granice dokaza

Validacija se dešava **nakon što Prisma učita payload iz baze**. Ne ograničava mrežni ulaz, kreiranje posla, DB storage ili trošak materijalizacije, a `Object.keys` i dalje alocira listu ključeva jednog već učitanog objekta. Direktni pozivi pojedinačnih parsera i putanje mimo workera nisu pokriveni. Potrebne su ulazne granice usklađene sa svim producentima, dokaz obrade postojećeg backlog-a i generated-Prisma/integracijski acceptance prije zatvaranja. Nije mijenjana baza niti pokretana migracija.
