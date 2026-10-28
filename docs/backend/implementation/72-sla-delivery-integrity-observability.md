# W5.45 — SLA delivery and integrity observability

**Finding:** `BA-sla-15`  
**Implementacija:** `c1ae4d1`, `faee216`  
**CI:** `40702205171` — zelen

## Problem

Ops snapshot je znao samo generički SLA scan scheduler status. Nije izlagao backlog i starost SLA runtime outboxa, delivery latency, dead-letter/empty fan-out, due scan backlog i poison stanje, odsutan scheduler kao eksplicitnu metriku, timer configuration drift niti due-before-start povrede. Operativni tim zato nije mogao iz jednog health ugovora razlikovati kašnjenje, delivery kvar i podatkovni integritet.

## Implementacija

Workerov postojeći periodični Ops collector sada u istom snapshotu izlaže `sla` signal sa sljedećim bounded DB metrikama:

- `transitionOutbox.pending`, `failed`, `oldestPendingAgeSeconds` i maksimalna success delivery latencija zadnjeg sata;
- `fanout.emptyLastHour` iz kanonskog `sla.escalation.audience_empty` audita i `failedLastHour` iz SLA runtime dead-letter outboxa;
- `scan.dueBacklog`, `oldestDueAgeSeconds`, retry-pending i quarantined/poison brojevi;
- `schedulerRegistered`, izveden iz stvarnog BullMQ `sla-scan` scheduler inventara;
- `configurationDrift`, za aktivne timere bez version/snapshot ugovora;
- `invalidDueBeforeStart`, iz DB-side integrity upita za response/resolution due prije `startedAt`.

Probe se izvršava samo kada je DB health uspješan, pod postojećim ops timeoutom; kvar probe vraća `sla: null` umjesto lažnih nula. Signal se čuva u postojećem Redis ops snapshotu i vraća kroz System Health API, bez novog paralelnog metrics storagea.

## Dokaz

- Direktni unit test potvrđuje svih šest grupa metrike, age/latency proračun, scheduler absence i bigint integrity count konverziju.
- Stvarni PostgreSQL test kreira pending SLA runtime outbox, timer bez configuration snapshota i due-before-start povredu te potvrđuje da ih collector vidi.
- Finalni CI `40702205171` je potpuno zelen: backend build/lint/cijeli suite, stvarni PostgreSQL/Redis shard, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release DB radnju.

## Ishod

SLA delivery, fan-out, scan i timer-integritet više nisu skriveni iza generičkih logova. Operativni snapshot sada razlikuje backlog, latency, poison, scheduler absence, config drift i nemoguće due vrijednosti. `BA-sla-15` je zatvoren; registar prelazi na **611 otvorenih / 81 zatvorenih / 692 ukupno**.
