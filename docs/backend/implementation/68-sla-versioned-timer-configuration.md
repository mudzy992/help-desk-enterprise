# W5.41 — Versioned SLA timer configuration and deterministic recompute

**Finding:** `BA-sla-11`  
**Implementacija:** `b7bb1db`, `715c3df`, `1e0fcf0`, `7964437`, `e7222be`  
**CI:** `40580180368` — zelen

## Problem

Aktivni SLA timer je čuvao minute i rule/profile reference, ali nije imao immutable verziju efektivne konfiguracije. Naknadna izmjena kalendara mogla se djelimično primijeniti na stari timer pri pause/resume obradi, dok rule promjena nije imala kontrolisan preview/recompute put. Nije postojao bounded, auditovan operativni workflow za migraciju aktivnih timera.

## Implementacija

### Immutable snapshot i politika

`TicketSlaState` sada čuva:

- `configurationVersion` — deterministični SHA-256 efektivne konfiguracije;
- `configurationSnapshot` — rule ID, response/resolution minute, timezone, weekly hours i praznike;
- `configurationAppliedAt`;
- `configurationPolicy` — `GRANDFATHER` ili `RECOMPUTE`.

Novi timeri dobijaju snapshot pri nastanku. Runtime koristi snapshottovani kalendar, pa kasnija promjena live kalendara ne mijenja grandfathered timer. Priority-change recompute eksplicitno zapisuje novu verziju/policy, ne briše ranije breach flagove niti fired escalation ključeve.

Migracija `20271027200000_sla_timer_configuration_snapshot` aditivno uvodi kolone i indeks te zamrzava konfiguraciju postojećih resolvable timer redova kao `legacy-import-v1`. Korisnik je potvrdio uspješnu primjenu migracije i redeploy.

### Bounded preview/apply workflow

Globalno autorizovani `sla.write` administrator dobija no-store endpointove:

- `POST /sla/timer-configuration-migrations/preview`;
- `POST /sla/timer-configuration-migrations/apply`.

Workflow je profile-scoped, cursor-paginiran i hard-limitiran na **100 aktivnih timera po batchu**. Preview klasificira `unchanged`, `drifted` i `unresolved` redove i vraća SHA-256 preview token. Token obuhvata state verzije i izračunate target verzije; svaka promjena statea, rulea ili kalendara zahtijeva novi preview (`STALE_WRITE`).

Apply zahtijeva token i obavezan razlog. Svaki timer se obrađuje pod ticket advisory lockom, recompute polazi od originalnog `startedAt` i akumulirane pause vrijednosti, čuva već završeni response/resolution i monotone breach/fired-escalation stanje, ponovo računa `nextDueAt`, te u istoj transakciji zapisuje change-log sa actorom i razlogom. Batch je idempotentan i repairable: uspješno migrirani redovi postaju `unchanged`, a operator nastavlja cursorom ili ponavlja preview nakon konflikta.

## Dokaz

- Unit dokaz potvrđuje stabilnost SHA-256 snapshot verzije i promjenu verzije za izmijenjeni target/kalendar.
- Stvarni PostgreSQL integration test kreira grandfathered aktivni timer, radi bounded preview, primjenjuje recompute i potvrđuje nove minute, `RECOMPUTE` policy, 64-znakovnu verziju i audit zapis.
- Wiring guard potvrđuje obje autorizovane rute; migration replay potvrđuje svih 94 migracije.
- CI `40580180368` je potpuno zelen: backend build/lint/test, realni PostgreSQL/Redis suite, frontend, docs, container/supply-chain i završni gate.

## Ishod

Aktivni timeri imaju eksplicitnu immutable konfiguracijsku provenijenciju i dokumentovanu grandfather politiku, dok se retroaktivna primjena radi isključivo kroz bounded, preview-token zaštićen, auditovan i determinističan recompute. `BA-sla-11` je zatvoren; registar prelazi na **615 otvorenih / 77 zatvorenih / 692 ukupno**.
