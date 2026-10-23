# Backend audit 45 — konsolidovani audit

**Status:** audit završen  
**Datum:** 2026-10-23  
**Opseg:** 43 backend modula + cross-cutting infrastruktura  
**Portfolio baseline:** **5,12/10** (neponderisani prosjek 44 audit jedinice)  
**Nalazi:** **692** jedinstvenih — 174 P1, 368 P2, 150 P3, 0 P0

## 1. Executive summary

Kompletan backend audit je završen bez implementacije korekcija. Pregledane su sve 43 module jedinice i završna cross-cutting površina: API/worker bootstrap, common infrastruktura, Prisma/migracije, Redis/BullMQ, CLI, container i operativne granice. Globalni registar sadrži **692 jedinstvenih BA ID-eva**, bez duplikata: **174 P1**, **368 P2** i **150 P3**. Nije identifikovan P0, ali broj i širina P1 nalaza isključuju production-readiness ocjenu blizu ciljanih 9,9.

Portfolio baseline je **5,12/10**, medijan **5,05/10**. To je transparentan neponderisani prosjek jedinica, a ne tvrdnja da su svi moduli iste veličine ili rizika. Cross-cutting infrastruktura ima 3,20/10 i utiče na svaki modul; zato stvarni rollout rizik nije dobro predstavljen samo aritmetičkim prosjekom. Najviša pojedinačna ocjena je authorization 8,48/10, najniža edge-extension 2,83/10. Nijedna jedinica nema baseline 9,0+.

Glavna presuda nije da postoje 692 potpuno nezavisna problema. Nalazi se grupišu u dvanaest sistemskih programa: identity/scope, transakcije i concurrency, audit/config trust, async delivery, migracije/DB privilegije, tajne i transport, upload/storage, API contracts/bounds, privacy/retention, observability/health, container/supply chain i dokazivost. Konsolidacija određuje primarnog ownera i redoslijed, ali ne briše izvorne ID-eve: svaki mora dobiti acceptance dokaz.

Najkraći siguran implementacijski put prvo zatvara reproducibilni CI/generated Prisma, non-root i least-privilege runtime, DB/Redis TLS, migration release job, durable revocation, immutable/redacted audit te shared outbox/idempotency/concurrency primitive. Tek nakon toga domain popravke imaju stabilnu osnovu. Master plan definiše 12 valova (0–11), dependency mapu, migracijske gateove, rollback i globalnu acceptance matricu.

## 2. Kanonski izlazi

1. [Globalni registar 692 nalaza](../BACKEND-FINDINGS-REGISTER.md);
2. [Implementacijski master plan](../BACKEND-IMPLEMENTATION-MASTER-PLAN.md);
3. [Inventar i status jedinica](../MODULE-INVENTORY.md);
4. pojedinačni auditi 01–44 u ovom direktoriju;
5. score i severity tabela u §4;
6. cross-module root-program mapa u §5;
7. dependency/migration i acceptance mapa u master planu.

## 3. Metod konsolidacije

- svi finding redovi parsirani su iz audit tabela; ID-evi su provjereni na globalnu jedinstvenost;
- severity nije administrativno mijenjan;
- slični nalazi nisu obrisani: grupisani su pod canonical program/owner jer različit modul često zahtijeva zaseban code i acceptance dokaz;
- portfolio score nije LOC/risk-weighted jer zaključani standard definiše score po audit jedinici, ne formulu za portfolio; zato se prikazuje neponderisani prosjek i puna distribucija;
- raniji test rezultati nisu ponovo proglašeni aktuelnim full-backend passom; ostaju lokalni dokaz na SHA-u svog audita;
- compile/environment blokade ostaju otvorene do Vala 0;
- nema zatvorenog nalaza niti behavior promjene u jedinici 45.

## 4. Globalna score tabela

| # | Jedinica | Baseline | P1 | P2 | P3 | Ukupno | Audit |
|---:|---|---:|---:|---:|---:|---:|---|
| 01 | `authentication` | **7,42/10** | 3 | 4 | 1 | 8 | [01-authentication.md](01-authentication.md) |
| 02 | `authorization` | **8,48/10** | 0 | 4 | 4 | 8 | [02-authorization.md](02-authorization.md) |
| 03 | `rbac` | **8,03/10** | 0 | 5 | 3 | 8 | [03-rbac.md](03-rbac.md) |
| 04 | `users` | **6,59/10** | 3 | 6 | 0 | 9 | [04-users.md](04-users.md) |
| 05 | `organizational-units` | **6,71/10** | 2 | 5 | 2 | 9 | [05-organizational-units.md](05-organizational-units.md) |
| 06 | `groups` | **6,73/10** | 3 | 5 | 2 | 10 | [06-groups.md](06-groups.md) |
| 07 | `settings` | **6,35/10** | 3 | 6 | 2 | 11 | [07-settings.md](07-settings.md) |
| 08 | `audit-log` | **6,38/10** | 3 | 6 | 2 | 11 | [08-audit-log.md](08-audit-log.md) |
| 09 | `security` | **6,00/10** | 3 | 6 | 2 | 11 | [09-security.md](09-security.md) |
| 10 | `security-audit-webhook` | **5,92/10** | 3 | 6 | 2 | 11 | [10-security-audit-webhook.md](10-security-audit-webhook.md) |
| 11 | `privacy` | **5,57/10** | 4 | 7 | 2 | 13 | [11-privacy.md](11-privacy.md) |
| 12 | `tickets` | **5,38/10** | 8 | 8 | 3 | 19 | [12-tickets.md](12-tickets.md) |
| 13 | `routing` | **5,82/10** | 2 | 6 | 3 | 11 | [13-routing.md](13-routing.md) |
| 14 | `sla` | **5,09/10** | 4 | 8 | 4 | 16 | [14-sla.md](14-sla.md) |
| 15 | `service-catalog` | **5,23/10** | 4 | 8 | 3 | 15 | [15-service-catalog.md](15-service-catalog.md) |
| 16 | `templates` | **5,35/10** | 3 | 7 | 3 | 13 | [16-templates.md](16-templates.md) |
| 17 | `notifications` | **5,05/10** | 3 | 8 | 4 | 15 | [17-notifications.md](17-notifications.md) |
| 18 | `websocket` | **4,88/10** | 4 | 7 | 3 | 14 | [18-websocket.md](18-websocket.md) |
| 19 | `integration-queue` | **4,41/10** | 4 | 8 | 3 | 15 | [19-integration-queue.md](19-integration-queue.md) |
| 20 | `inbound-email` | **5,06/10** | 3 | 7 | 3 | 13 | [20-inbound-email.md](20-inbound-email.md) |
| 21 | `on-call` | **4,84/10** | 3 | 8 | 3 | 14 | [21-on-call.md](21-on-call.md) |
| 22 | `assets` | **4,59/10** | 4 | 11 | 4 | 19 | [22-assets.md](22-assets.md) |
| 23 | `problems` | **4,21/10** | 7 | 9 | 3 | 19 | [23-problems.md](23-problems.md) |
| 24 | `changes` | **4,28/10** | 7 | 10 | 3 | 20 | [24-changes.md](24-changes.md) |
| 25 | `knowledge-base` | **4,51/10** | 4 | 11 | 4 | 19 | [25-knowledge-base.md](25-knowledge-base.md) |
| 26 | `reports` | **4,70/10** | 2 | 12 | 5 | 19 | [26-reports.md](26-reports.md) |
| 27 | `search` | **5,62/10** | 1 | 7 | 5 | 13 | [27-search.md](27-search.md) |
| 28 | `announcements` | **4,31/10** | 4 | 11 | 4 | 19 | [28-announcements.md](28-announcements.md) |
| 29 | `status-page` | **4,11/10** | 5 | 10 | 4 | 19 | [29-status-page.md](29-status-page.md) |
| 30 | `config-versioning` | **3,55/10** | 7 | 10 | 3 | 20 | [30-config-versioning.md](30-config-versioning.md) |
| 31 | `install` | **4,02/10** | 6 | 11 | 4 | 21 | [31-install.md](31-install.md) |
| 32 | `setup-checklist` | **6,08/10** | 0 | 7 | 4 | 11 | [32-setup-checklist.md](32-setup-checklist.md) |
| 33 | `policy-packs` | **3,68/10** | 7 | 9 | 3 | 19 | [33-policy-packs.md](33-policy-packs.md) |
| 34 | `service-onboarding` | **4,15/10** | 7 | 10 | 3 | 20 | [34-service-onboarding.md](34-service-onboarding.md) |
| 35 | `directory-sync` | **3,40/10** | 8 | 11 | 4 | 23 | [35-directory-sync.md](35-directory-sync.md) |
| 36 | `teams` | **4,05/10** | 6 | 10 | 4 | 20 | [36-teams.md](36-teams.md) |
| 37 | `edge-extension` | **2,83/10** | 7 | 10 | 4 | 21 | [37-edge-extension.md](37-edge-extension.md) |
| 38 | `branding` | **6,27/10** | 0 | 8 | 5 | 13 | [38-branding.md](38-branding.md) |
| 39 | `health` | **5,64/10** | 1 | 9 | 4 | 14 | [39-health.md](39-health.md) |
| 40 | `observability` | **4,08/10** | 4 | 10 | 4 | 18 | [40-observability.md](40-observability.md) |
| 41 | `ops-health` | **3,68/10** | 7 | 12 | 5 | 24 | [41-ops-health.md](41-ops-health.md) |
| 42 | `docs` | **5,50/10** | 2 | 8 | 5 | 15 | [42-docs.md](42-docs.md) |
| 43 | `change-log` | **3,57/10** | 5 | 10 | 5 | 20 | [43-change-log.md](43-change-log.md) |
| 44 | `cross-cutting-infrastructure` | **3,20/10** | 8 | 17 | 7 | 32 | [44-cross-cutting-infrastructure.md](44-cross-cutting-infrastructure.md) |
|  | **Portfolio** | **5,12/10** | **174** | **368** | **150** | **692** |  |

### Distribucija ocjena

| Raspon | Broj jedinica |
|---|---:|
| 8,00–8,99 | 2 |
| 7,00–7,99 | 1 |
| 6,00–6,99 | 8 |
| 5,00–5,99 | 12 |
| 4,00–4,99 | 14 |
| 3,00–3,99 | 6 |
| 2,00–2,99 | 1 |
| 9,00+ | 0 |

## 5. Deduplikovani root programi

| Program | Primarni owner | Reprezentativne jedinice | Konsolidovani problem | Obavezna osnova |
|---|---|---|---|---|
| RP-01 Identity i scope | WS-A | 01–06, 09, 31, 42, 44 | role-key shortcuti, scope gubitak, stale revocation, step-up i public route klasifikacija | canonical principal/scope policy + durable revocation + route manifest |
| RP-02 Transaction integrity | WS-B | 07–16, 22–35, 43 | business mutation, audit, outbox, cache i file nisu uvijek jedan siguran commit/recovery tok | transaction command + outbox + storage reconciliation |
| RP-03 Concurrency/idempotency | WS-B/WS-F | 12–16, 21–36 | read-before-write, dupli claim, approval race, bulk partial state | optimistic version, locks, idempotency result i crash tests |
| RP-04 Audit/config trust | WS-C | 07–10, 30, 33, 43 | redaction, tamper, reason/action schema, diff semantika, config signature/activation | append-only audit + typed diff + signed/versioned config |
| RP-05 Async delivery | WS-D | 14, 17–21, 28–29, 36, 44 | fail-open scheduler, retry taxonomy, provider ambiguity, DLQ/replay i drain | mandatory readiness + transactional outbox + reconcile |
| RP-06 DB/migracije | WS-B/WS-G | svi data moduli, 44 | široke runtime privilegije, startup migracije, destruktivni DDL/DML, rollback/restore | release migrator role + expand/backfill/contract + restore drill |
| RP-07 Secret/transport | WS-E/WS-G | 01, 07, 09–11, 20, 35–37, 44 | TLS, key purpose/rotation, token lifecycle, logging | typed secret schema + verified TLS + rotation/revocation |
| RP-08 Upload/storage | WS-E/WS-F | 11–12, 22, 25–26, 31, 38 | path/MIME/size, DB-file atomarnost, persistence/cleanup | stage/promote/reconcile + bounded validated storage |
| RP-09 API/bounded work | domain owners | gotovo svi | scope-after-pagination, unstable cursor, unlimited export/list/bulk i typed errors | shared pagination/export/bulk contract + query-plan gate |
| RP-10 Privacy/retention | WS-E | 08, 10–11, 17, 25–26, 40, 43 | PII duplication, legal hold, retention, erase/export evidence | data classification + retention engine + legal-hold tests |
| RP-11 Ops/observability | WS-G | 18–21, 26, 39–44 | health semantika, local-only state, cardinality, tracing, alert race | API/worker capability health + structured telemetry |
| RP-12 Build/evidence | WS-G/WS-H | svi, posebno 37–44 | generated Prisma blokade, nema full integration/multi-replica/restore dokaza, image supply chain | reproducible CI + disposable dependencies + container/security gate |

Ovih 12 programa su izvršni deduplikovani owneri. Oni nisu zamjena za 692 acceptance obavezu. Primjer: shared pagination primitive može zatvoriti isti root cause, ali tickets, reports i search i dalje trebaju vlastiti scope/order/load dokaz.

## 6. Cross-module zavisnosti

### Identity lanac

`authentication → principal context → authorization → RBAC/users/OU/groups → svaki controller/websocket/docs`. Revocation i scope se rješavaju prije domain permission korekcija. Install founder i E2E actor tokovi moraju koristiti isti account invariant.

### Data-integrity lanac

`restricted runtime role → migration discipline → audit/outbox primitive → domain transakcije → cache/realtime invalidacija`. Audit/change-log ne mogu biti pouzdani dok root DB credential može retroaktivno mijenjati historiju bez granice.

### Async lanac

`Redis TLS/namespace → worker readiness/drain → outbox/claims → notifications/integration queue/inbound email/on-call/Teams/announcements/status`. Scheduler ili provider popravke prije lifecycle i idempotency osnove stvaraju nove lokalne varijante istog problema.

### Config lanac

`settings encryption/redaction → config version/signature/activation → install/policy packs/onboarding/directory/Teams/branding → docs/ops visibility`. Environment-bound tajne se ne smiju tretirati kao običan prenosivi config.

### Observability lanac

`bounded request ID + redaction → structured logs → trace propagation → health/capability metrics → ops-health alert state → runbook/recovery`. Alerting nad nepotpunim ili high-cardinality signalima nije pouzdan finalni gate.

## 7. Migracijska mapa

| Klasa promjene | Pogođeni programi | Obavezni rollout | Zabranjeni shortcut |
|---|---|---|---|
| Role/permission/scope | RP-01 | report anomalija → dual compatibility → backfill → constraint | direktan rename/delete permissiona |
| Audit/change schema | RP-02/RP-04 | new version columns/table → dual write/read → verifier → retention migration | prepisivanje stare historije bez manifesta |
| Outbox/idempotency | RP-02/RP-03/RP-05 | additive tables/indexes → shadow emit → worker cutover → old path retirement | claim-before-effect bez recovery statea |
| Domain state/version | RP-03 | nullable version → backfill → optimistic checks → NOT NULL/check | status constraint prije data repaira |
| Config versions | RP-04 | signature/key ID/version metadata → verify existing → activation cutover | automatsko povjerenje starom unsigned paketu |
| Secret/cipher | RP-07 | key ID + previous-key read → batch reencrypt → verify → retire | one-shot key swap bez unreadable reporta |
| Storage reference | RP-08 | inventory/orphan manifest → staged path → reconcile → cleanup | hard delete fajla prije DB commit/retention odluke |
| Pagination/index | RP-09 | query contract → concurrent index → explain/load verify → limit enforce | limit nakon in-memory scope filtera |
| Retention/legal hold | RP-10 | classify → hold-aware candidates → dry-run counts → bounded delete | bulk delete bez hold preflighta |
| Runtime privilege | RP-06/RP-12 | create restricted roles → canary → revoke DDL → dedicated migrator | ista URL/rola za migrate i runtime |

Svaka contract migracija zahtijeva dokaz da prethodna aplikacijska verzija može raditi tokom rolling deploya ili eksplicitni maintenance plan. Destruktivne migracije zahtijevaju backup/restore ili exported repair manifest; komentar u SQL-u nije rollback dokaz.

## 8. Globalna test strategija

| Sloj | Šta dokazuje | Minimalni critical scenario |
|---|---|---|
| Unit | parser, mapper, state transition, crypto/diff | invalid/missing/null/boundary fixture |
| Nest wiring | guards, filteri, interceptori, provider ownership | route manifest i API/worker separation |
| PostgreSQL integration | constraints, locks, transaction rollback, query shape | dva konkurentna writera + crash point |
| Redis/BullMQ integration | revocation, scheduler, claim/retry/DLQ | outage/restart + dvije worker replike |
| Filesystem/object storage | stage/promote/path/persistence/cleanup | DB commit/file failure u oba redoslijeda |
| Contract | backend producer ↔ frontend/extension/webhook consumer | enum/null/error/pagination fixture |
| E2E | permission/scope i business tok | cross-user/cross-OU + retry istog zahtjeva |
| Migration | zero, upgrade, mixed version, restore | realističan old-data fixture + verify counts |
| Performance | bounds, index, pool, cardinality | production-shape dataset i concurrency |
| Container/security | UID/FS/TLS/SBOM/dependency | non-root read-only runtime + invalid CA |
| Multi-replica | cache/realtime/job/alert races | dvije API + dvije worker instance |
| Recovery drill | operativni RPO/RTO | migration failure, Redis outage, DB restore |

## 9. Prioritet i release politika

- **P1:** ulazi u Valove 1–8; nema production releasea sa otvorenim P1 bez formalne, vremenski ograničene owner exception odluke i dokazive kompenzacijske kontrole.
- **P2:** zatvara se uz odgovarajući workstream; P2 test/ops dug koji blokira dokaz P1 tretira se kao dependency, ne odgađa se.
- **P3:** završno poliranje ili planirani backlog, ali 9,90+ zahtijeva zatvaranje ili formalno prihvaćen status prema standardu.
- **P0:** trenutno 0; svaki novootkriveni P0 prekida val i aktivira hitnu izolaciju.

## 10. Implementacijski redoslijed

Master plan propisuje:

1. Val 0 — reproducibilni dokaz i generated Prisma;
2. Val 1 — runtime perimeter, privilege/TLS/migration/worker;
3. Val 2 — identity, scope i authorization;
4. Val 3 — audit/config/change trust;
5. Val 4 — transaction/idempotency/concurrency primitive;
6. Valovi 5–8 — domain i integration korekcije po zavisnostima;
7. Val 9 — health/observability/ops hardening;
8. Val 10 — CLI/data repair/migration closure;
9. Val 11 — full regression, recovery drill, rescore i release gate.

Detaljni paketi, acceptance, rollback i paralelizacija nalaze se u [master planu](../BACKEND-IMPLEMENTATION-MASTER-PLAN.md).

## 11. Rizici implementacije

- stroži authorization može otkriti postojeće nelegalne assignment kombinacije i privremeno odbiti ranije dopušten tok;
- transaction/outbox cutover može duplirati događaj ako dual-write nema isti idempotency ključ;
- DB privilege rez može otkriti implicitni DDL/extension/runtime dependency;
- expand-contract migracije povećavaju privremeni storage i složenost readera;
- redaction može ukloniti operativno koristan kontekst ako classification registry nije precizan;
- queue retry korekcija može reaktivirati stare poison poslove bez quarantine politike;
- bounded pagination/export mijenja consumer očekivanja i traži frontend/extension contract koordinaciju;
- non-root/read-only image može otkriti skrivene runtime write putanje;
- directory/config repair može biti nepovratan bez manifest/backup discipline;
- veliki broj nalaza povećava rizik administrativnog zatvaranja — automatski traceability checker je obavezan.

## 12. Quality gate jedinice 45

- 44/44 audit dokumenta postoje;
- 692 finding reda parsirano je u globalni registar;
- ID duplikata: 0;
- severity zbir: 174 P1 + 368 P2 + 150 P3 = 692;
- score tabela ima 44 jedinice i transparentnu portfolio formulu;
- definisani su root programi, owneri, dependency i migracijska mapa;
- master plan ima faze, acceptance, rollback, test slojeve i release gate;
- nije izmijenjen produkcijski kod niti status ijednog izvornog nalaza.

## 13. Konačna presuda

Backend audit ciklus je dokumentacijski kompletan. Funkcionalna širina i broj postojećih testova su značajni, ali sistem nije spreman za iskrenu enterprise ocjenu blizu 9,9 dok su otvorena 174 P1 nalaza i cross-cutting baseline 3,20/10. Implementacija treba početi Valom 0, ne nasumičnim module-by-module popravkama. Svaki naredni rezultat mora se dokazati na aktuelnom kodu i testu; ovaj baseline se ne povećava administrativno.
