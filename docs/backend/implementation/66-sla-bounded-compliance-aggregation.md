# W5.39 — Bounded SLA compliance agregacija

**Finding:** `BA-sla-09`  
**Implementacija:** `6e22b2d`  
**CI:** `40570437083` — zelen

## Problem

Compliance endpoint je učitavao svaki terminalni ticket/state u zadanom OU podstablu i vremenskom prozoru, uključujući nazive povezanih resursa, a zatim u Node procesu gradio profile/unit/service/group grupe. Dozvoljeni prozor do 365 dana zato nije imao row, memory, response-size ni execution-time granicu.

## Implementacija

Produkcijski Prisma/PostgreSQL put sada radi agregaciju u bazi. Jedan bounded SQL CTE prvo primjenjuje OU, terminal-status i completion-window filter, a zatim vraća samo agregate kroz profile, unit, service i group dimenzije. Aplikacija više ne materijalizuje ticket-level compliance redove.

Uvedeni su eksplicitni budžeti:

- maksimalni period ostaje validirani API limit od **365 dana**;
- najviše **1.000 SLA profila**;
- najviše **15.000 agregatnih redova**, uz `LIMIT 15001` overflow sentinel;
- najviše **4 MiB** serijalizovanog odgovora;
- read transakcija ima **10 s execution timeout** i **2 s max-wait**.

Prekoračenje bilo koje aplikacijske granice faila stabilnim `COMPLIANCE_RESOURCE_LIMIT_EXCEEDED` kodom. Open response/resolution breach vrijednosti ostaju zasebni DB `COUNT` upiti. In-memory domain harness zadržava stari row-based put isključivo kao eksplicitni test adapter.

## Dokaz

- Fokusirani test potvrđuje mapiranje PostgreSQL aggregate rezultata bez ticket-row loadanja i fail-closed row-budget ponašanje.
- Novi obavezni isolated PostgreSQL suite kreira realni resolved ticket/state i potvrđuje profile, OU i service agregate i procente na migriranoj šemi.
- Integration-runner harness zahtijeva prisustvo suitea, pa ga CI ne može tiho preskočiti.
- CI `40570437083` je potpuno zelen: generated Prisma/build, svi backend testovi, PostgreSQL/Redis integracije uključujući novi compliance shard, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release DB radnju.

## Ishod

Compliance trošak više nije proporcionalan broju ticket redova u Node memoriji; DB agregira unutar jasno definisanog time/row/byte budžeta. `BA-sla-09` je zatvoren; registar prelazi na **617 otvorenih / 75 zatvorenih / 692 ukupno**.
