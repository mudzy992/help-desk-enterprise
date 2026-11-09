# W6.55 — BA-integration-queue-05: istekli PROCESSING claim

**Status:** djelimična implementacija; nalaz ostaje otvoren. Datum: 2026-10-29.

## Ponašanje

Postojeći 15-sekundni dispatch reconciliation čita do 100 isteklih `PROCESSING` claimova po sweepu (i legacy null-lease redove starije od 5 minuta). Svaki red se atomarno prebacuje u `DLQ` sa sigurnim kodom `PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN`, samo ako i dalje odgovara status, version, attempts, owner, attempt, lease i `updatedAt` snapshotu te uslovu isteka. Version se povećava i claim briše; stari worker više ne može upisati terminalno stanje. Različiti worker-i mogu istovremeno čitati red, ali samo jedan CAS može uspjeti. Nastavlja se redovna obrada do 100 pending/due failed redova. Greške quarantine pojedinačno se loguju i broje.

Ovo je **karantin, ne automatski replay**. SMTP, Teams ili Edge side effect je možda već izvršen ili se još izvršava; automatski retry ili reset može duplirati isporuku. Normalni admin retry za ovaj kod je server-side blokiran, dugme skriveno, a BS/EN UI prikazuje nepoznat ishod. DLQ retention izuzima ove redove da ne obriše dokaz prije provjere. Ostali DLQ retry/retention ugovori ostaju nepromijenjeni. Potrebna je operaterska provjera providera i incident procedura; ovaj paket ne uvodi UI za razrješenje niti replay.

## Ograničenja i dokaz

Lease se **ne obnavlja**: legitimni posao duži od 5 minuta može biti stavljen u karantin iako worker još radi. CAS štiti stanje IntegrationJob-a, ali ne može otkazati ili ograditi poziv eksternom provideru; email ledger se ne mijenja pri karantinu i stari worker ga može naknadno ažurirati. Nema tvrdnje o exactly-once isporuci, dokazu da je worker zaista mrtav, automatskom oporavku ni konzistentnoj reconciliation transakciji sa email ledgerom. Neograničeno zadržavanje karantiniranih redova traži operativni postupak i naknadni lifecycle. Query je ograničen brojem vraćenih redova, ne garantuje ograničen DB scan; nema novog indeksa. Scheduler/Redis kvar i dalje može zaustaviti sweep.

Lokalni ciljano pokrenuti Jest koristi privremene Prisma enum/client stubove i `diagnostics:false`: **4 suitea / 32 testa**; mockovi nisu dokaz stvarnog Prisma SQL-a. Dodan je PostgreSQL integration test za paralelni CAS, fencing starog workera i zabranu retryja, ali nije lokalno izvršen bez generated Prisma klijenta i stvarne baze. Backend targeted ESLint, frontend targeted Vitest **2/2**, ESLint i TypeScript build prošli su. Nema runtime Redis/PostgreSQL acceptance, fault-injection/provider outcome testa ni push-triggered CI potvrde; full CI/E2E nije ručno pokretan. `BA-integration-queue-05` ostaje otvoren dok recovery/renewal/reconciliation ugovor i CI/acceptance nisu dokazani.

Nema schema promjene, migracije, target-DB upotrebe, PR-a, mergea ili deploymenta. BA-06 websocket i dalje zahtijeva CI/generated-Prisma i stvarni Redis/two-instance acceptance.
