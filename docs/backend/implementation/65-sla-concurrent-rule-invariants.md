# W5.38 — Concurrency-safe SLA rule/escalation invarianti

**Finding:** `BA-sla-08`  
**Implementacija:** `4357ba3`  
**CI:** `40568593132` — zelen

## Problem

Rule effective-key, escalation offset i maksimalan broj escalation levela provjeravali su se read-before-write upitima izvan write transakcije. Paralelni requesti su mogli oba proći provjeru i zatim kreirati duplikate ili preći konfigurirani maksimum. Update je imao isti stale-read prozor.

## Implementacija

Uveden je jedinstveni transaction-scoped PostgreSQL advisory lock po SLA profilu. Create i update putanje za SLA rules i escalation rules sada unutar iste zaključane transakcije ponovo učitavaju aktuelno stanje, provjeravaju targete/invariante, izvršavaju write i zapisuju ChangeLog. Različiti profili ostaju paralelni.

DB je dodatna fail-closed granica:

- `SlaRule_effective_key_key` je `UNIQUE NULLS NOT DISTINCT` nad profilom, prioritetom, OU i servisom, pa i globalni/null scope ima stvarnu jedinstvenost;
- `SlaEscalationRule_profile_offset_key` garantuje jedinstven offset unutar profila.

Maksimalan broj escalation levela ostaje konfiguracijski, ali se count i create sada izvršavaju pod istim profile lockom, tako da ga konkurentni writeri ne mogu prekoračiti.

## PostgreSQL dokaz

Obavezni isolated PostgreSQL shard sa dva nezavisna Prisma klijenta dokazuje:

1. od dva paralelna createa istog rule effective keya uspijeva tačno jedan;
2. od dva paralelna createa istog escalation offseta uspijeva tačno jedan;
3. dva različita offseta koja konkuriraju za posljednji dozvoljeni level prolaze kroz isti profile lock, pa uspijeva tačno jedan i konačni count ostaje na maksimumu.

Generated Prisma schema, kompletan migration replay i runtime schema sentinel također su potvrđeni u CI-ju.

## Migracija i release

Paket uvodi migraciju **`20271027190000_sla_rule_invariants`**. Migracija kreira oba unique indeksa i namjerno faila ako produkcijski podaci već sadrže duplikate koji moraju biti ručno razriješeni.

**Migraciju je obavezno ručno izvršiti release migratorom pri releaseu/redeployu prije pokretanja nove aplikacijske verzije.**

## Validacija

CI `40568593132` je potpuno zelen: generated Prisma/build, svi backend testovi, novi PostgreSQL concurrency dokaz, migration history/runtime-role provjere, frontend, docs, container/supply-chain i završni gate.

## Ishod

Effective rule key, escalation offset i max-level više ne zavise od nesigurnog read-before-write redoslijeda. `BA-sla-08` je zatvoren; registar prelazi na **618 otvorenih / 74 zatvorena / 692 ukupno**.
