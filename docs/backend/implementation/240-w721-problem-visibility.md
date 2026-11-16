# W7.21 — BA-problems-02: problem i povezani tiketi

**Status: implementacija u toku, nije closeout i nije spremno za merge/deploy.** Vlasnik je izabrao: puni zapis, analiza i historija samo unutar `problem.read` OU opsega; rad na povezanom tiketu izvan tog opsega daje samo minimalnu ticket karticu/workaround, a reporter izvan opsega nema izuzetak za puni zapis. Povezani tiketi bez pristupa ne pojavljuju se ni kroz ukupan broj. Nema odobrenja za proširenje prava.

## Triage i cilj

BA-problems-02 (P1), WS-F. Potrebno je obuhvatiti listu, detail, events, links i reverse putanje, ticket-panel i sve povezane ticket podatke uključujući brojače, event detail, preview i izvedene podatke. Ne mijenjati historijski BA-problems-04 niti automatski zatvarati BA-problems-03/05. Ticket read i confidential policy mora biti izvor autoriteta; filtriranje se mora primijeniti prije cap/paginacije i agregiranja. Provjeriti mutation response i poslovne granice create/link kako se UI ne bi ponašao kao da je ovlast data kad nije. Nema migracije niti pristupa ciljnoj bazi.

## Prvi korak — nije potpuna ispravka

`problemVisibilityWhere` sada daje puni zapis samo prema OU scopeu relevantne permisije, bez linked-ticket i reporter bypassa. Prazan scope je nemoguć ID skup umjesto postojećeg NUL sentinela. To utiče i na write putanje koje koriste istu funkciju; kompatibilnost i UI treba provjeriti. Minimalna ticket kartica zadržana je, a `canUnlink` za povezani problem sada dodatno provjerava `problem.report` scope; potrebni su posebni testovi tih kontrola i ponašanja kreiranja/povezivanja.

Dvije lokalne regresije su prije promjene očekivano pale; poslije 16/16 u `problem-tickets.service.spec.ts` s `ts-jest diagnostics:false`, uključujući mock test minimalne kartice i kontrole; ESLint za izmijenjene fajlove pass. Generated Prisma nije lokalno dokazan tim testom. **Preostaje:** per-ticket visibility i ispravni vidljivi brojači, historija/eventi, derived asset suggestions i resolve preview, concurrency/HTTP/frontend i PostgreSQL acceptance, CI i korisnička vizuelna provjera. Trenutno neke od tih putanja još mogu otkrivati nedostupne tikete; ne interpretirati prvi korak kao sigurnu kompletnu isporuku niti zatvarati BA-02. Prijavljeno treperenje ticket kartice je zaseban UX follow-up iz [239](239-w720-problem-ticket-unlink.md).
