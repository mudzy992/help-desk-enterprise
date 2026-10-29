# W6.9 — Bounded SQL uptime agregacija i status-page resource budžeti

**Finding:** `BA-status-page-10`  
**Implementacija:** `b0cb593`  
**Finalni CI:** `40832485277` — zelen

## Problem

Status overview je bez limita učitavao sve aktivne servise i sve aktuelne/buduće downtime prozore. Za uptime je dodatno materijalizovao svaki `DOWN` incident-service span za cijeli history period i sve servise, zatim overlap union i procenat računao u Node procesu. Rast kataloga i incident historije zato je linearno povećavao DB rezultat, aplikacijsku memoriju, CPU i JSON payload.

## Implementacija

- Aktivni service catalog query ima deterministički `name, id` poredak i eksplicitni probe budžet **500 + 1**.
- Downtime-window query ima deterministički `startsAt, id` poredak i probe budžet **1.000 + 1** unutar postojećeg 14-dnevnog prozora.
- Response izlaže `servicesHasMore` i `plannedHasMore`; payload se reže na 500 odnosno 1.000 zapisa umjesto neograničene materijalizacije.
- Signed-in i public frontend ugovori prenose oba truncation signala. UI prikazuje lokalizovano upozorenje kada je bilo koji resource budžet dosegnut, tako da truncation nije tih.
- Uptime više ne učitava incident spanove u Node. Jedan parametrizovani PostgreSQL query:
  - ograničava se na ID-eve bounded service stranice;
  - filtrira samo relevantne `DOWN` intervale koji presijecaju history prozor;
  - reže svaki interval na granice prozora;
  - window funkcijom određuje overlap islands po servisu;
  - spaja svaki island u SQL-u;
  - vraća samo jedan zbir downtime milisekundi po pogođenom servisu.
- Aplikacija iz najviše jednog aggregate reda po servisu računa postojeći one-decimal uptime ugovor; servis bez downtime aggregate reda dobija 100%.
- SQL query je parametrizovan kroz Prisma SQL primitive i ne interpolira identifikatore ručno.
- Public sanitizer eksplicitno prenosi samo bounded categories/windows i oba `hasMore` signala.

## Testni dokaz

- Direktni resource-budget unit test vraća 501 servis i 1.001 window te potvrđuje query `take` granice, payload 500/1.000 i oba `hasMore=true` signala.
- Direktni SQL mapper test potvrđuje pretvaranje bounded downtime aggregatea u one-decimal uptime procenat.
- Stvarni PostgreSQL test kreira dva preklopljena `DOWN` intervala u četverosatnom prozoru. SQL island agregacija ih računa kao tri, a ne četiri sata downtimea, i vraća tačnih **25% uptimea**.
- Postojeći status-page overlay/uptime, visibility, pagination, authorization i lifecycle testovi ostaju zeleni.
- Lokalni frontend TypeScript/Vite build je prošao; lokalni Prisma generate nije mogao preuzeti binary zbog sandbox TLS/network ograničenja, pa je CI svježi generate autoritativan.
- Finalni CI `40832485277` potpuno je zelen: backend build/lint/kompletni testovi, stvarni PostgreSQL/Redis shard, frontend build/test/format/i18n, docs, wiring, container/supply-chain i završni gate.

## Migracije i release

Paket mijenja samo read query i response ugovor. **Nema nove DB migracije** niti ručne release DB radnje.

## Ishod

`BA-status-page-10` je zatvoren. Catalog i maintenance-window payloadi imaju eksplicitne budžete i vidljiv truncation ugovor, dok uptime DB rezultat više ne raste sa brojem historijskih incident spanova nego najviše sa bounded brojem prikazanih servisa. Registar prelazi na **600 otvorenih / 92 zatvorena / 692 ukupno**.
