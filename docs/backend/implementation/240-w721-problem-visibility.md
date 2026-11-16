# W7.21 — BA-problems-02: problem i povezani tiketi

**Status: implementacija u toku, nije closeout i nije spremno za merge/deploy.** Vlasnik je izabrao: puni zapis, analiza i historija samo unutar `problem.read` OU opsega; rad na povezanom tiketu izvan tog opsega daje samo minimalnu ticket karticu/workaround, a reporter izvan opsega nema izuzetak za puni zapis. Povezani tiketi bez pristupa ne pojavljuju se ni kroz ukupan broj. Nema odobrenja za proširenje prava.

## Triage i cilj

BA-problems-02 (P1), WS-F. Potrebno je obuhvatiti listu, detail, events, links i reverse putanje, ticket-panel i sve povezane ticket podatke uključujući brojače, event detail, preview i izvedene podatke. Ne mijenjati historijski BA-problems-04 niti automatski zatvarati BA-problems-03/05. Ticket read i confidential policy mora biti izvor autoriteta; filtriranje se mora primijeniti prije cap/paginacije i agregiranja. Provjeriti mutation response i poslovne granice create/link kako se UI ne bi ponašao kao da je ovlast data kad nije. Nema migracije niti pristupa ciljnoj bazi.

## Prvi korak — nije potpuna ispravka

`problemVisibilityWhere` sada daje puni zapis samo prema OU scopeu relevantne permisije, bez linked-ticket i reporter bypassa. Prazan scope je nemoguć ID skup umjesto postojećeg NUL sentinela. To utiče i na write putanje koje koriste istu funkciju; kompatibilnost i UI treba provjeriti. Minimalna ticket kartica zadržana je, a `canUnlink` za povezani problem sada dodatno provjerava `problem.report` scope; potrebni su posebni testovi tih kontrola i ponašanja kreiranja/povezivanja.

## Drugi međukorak

Lista povezanih tiketa sada koristi centralni ticket-list predikat (OU/service, članstvo i povjerljivost) u SQL upitu prije limita i računanja brojeva liste; greška pri učitavanju konteksta ne otvara pristup. Brojevi te liste su i dalje ograničeni na najviše 500 vidljivih redova. Kontrole detalja više ne dodjeljuju write ovlasti zbog rada na povezanom tiketu. Dodan je PostgreSQL scenarij s običnim i povjerljivim tiketom, ali lokalno nije izveden; problem permission i identity su fixture, ne puni HTTP lanac. Još nije pokriveno skrivanje historijskih i drugih agregata, zato ovaj korak nije deployable.

Dvije lokalne regresije su prije promjene očekivano pale; poslije 16/16 u `problem-tickets.service.spec.ts` s `ts-jest diagnostics:false`, uključujući mock test minimalne kartice i kontrole; ESLint za izmijenjene fajlove pass. Drugi međukorak: 20/20 mock testova (diagnostics:false), ESLint pass; pokušaj `problems-audit-scope.spec.ts` nije pokrenut zbog nedostajućeg generated Prisma klijenta. Lokalni `db:generate` prvo je prijavio nedostajući DATABASE_URL, a s testnim URL-om TLS prekid prema binaries.prisma.sh. Generated Prisma i PostgreSQL dokaz prepušteni su automatskom CI-ju. **Preostaje:** per-ticket visibility i ispravni vidljivi brojači, historija/eventi, derived asset suggestions i resolve preview, concurrency/HTTP/frontend i PostgreSQL acceptance, CI i korisnička vizuelna provjera. Trenutno neke od tih putanja još mogu otkrivati nedostupne tikete; ne interpretirati prvi korak kao sigurnu kompletnu isporuku niti zatvarati BA-02. Prijavljeno treperenje ticket kartice je zaseban UX follow-up iz [239](239-w720-problem-ticket-unlink.md).
