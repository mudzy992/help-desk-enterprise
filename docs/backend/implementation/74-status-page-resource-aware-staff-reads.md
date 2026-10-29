# W6.1 — Resource-aware status-page STAFF_ONLY read granica

**Finding:** `BA-status-page-01`  
**Implementacija:** `e60e997`  
**CI:** `40732153002` — zelen

## Problem

Status viewer je sve AGENT i ADMIN assignment role spajao u jedan globalni `isStaff` boolean. Service- ili OU-scoped assignment je zato otkrivao svaki `STAFF_ONLY` incident, uključujući incidente stranih servisa, imena autora, broj povezanih ticketa i broj subscribera. Ista globalizovana odluka korištena je u overviewu, pojedinačnom incident readu, service banneru i ticket-linked panelu.

## Implementacija

- Viewer sada razlikuje eksplicitni globalni staff/SUPER_ADMIN mode od service i OU scope podataka izvedenih direktno iz postojećeg `PrincipalContext.assignments` ugovora.
- Scoped AGENT/ADMIN više se ne globalizuje preko agregiranog `roleKeys` polja; globalni staff postoji samo za SUPER_ADMIN ili nescopeani AGENT/ADMIN assignment.
- Jedan fail-closed `withIncidentVisibility` predikat primjenjuje istu odluku na overview, history, pojedinačni incident, service read i ticket-linked read.
- `STAFF_ONLY` incident prolazi service-scoped read samo kada ima najmanje jedan servis i svaki njegov servis pripada eksplicitnom service scopeu actora. OU-only assignment ostaje fail-closed jer status incident nema OU resource dimenziju koja bi se mogla sigurno projektovati.
- Ticket staff pristup autorizuje panel, ali ne promovira viewer u globalnog status-page staff actora.
- Author imena i linked-ticket/subscriber counters vraćaju se tek nakon što isti resource-aware query prihvati incident; requester i anonymous put ostaju `ALL_USERS`-only.
- Javni sanitizer je promijenjen iz spread kopiranja u eksplicitnu allowlist projekciju, pa buduće interno polje ne može slučajno preći javnu granicu.

## Testni dokaz

- Direktni viewer testovi dokazuju globalni, service-scoped, OU-scoped i missing-context model.
- Direktna visibility matrica dokazuje service scope, prazan/OU-only fail-closed slučaj, globalni mode i ticket read bez privilege promocije.
- Public boundary test dokazuje uklanjanje STAFF_ONLY incidenta, autora, oba countera, subscription stanja, manage konfiguracije i simuliranog budućeg internog polja.
- Stvarni PostgreSQL cross-service scenarij dokazuje da mail-scoped actor vidi mail STAFF_ONLY incident, autora i subscriber counter, dok VPN-scoped actor isti incident ne vidi u overviewu, service readu ni pojedinačnom readu.
- CI `40732153002` potpuno je zelen: generated-Prisma build/test, kompletni backend suite, stvarni PostgreSQL/Redis shard, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release DB radnju.

## Ishod

`BA-status-page-01` je zatvoren. Scoped staff assignment više ne otkriva foreign-service STAFF_ONLY incidente niti njihove autore i counters; centralni registar prelazi na **609 otvorenih / 83 zatvorenih / 692 ukupno**.
