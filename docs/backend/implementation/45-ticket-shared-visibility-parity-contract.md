# W5.18 — Shared visibility parity contract

**Finding:** `BA-tickets-18`  
**Implementacija i dokaz:** `58b55f1`  
**CI:** `40362428376` — zelen

## Problem

Detail/list su imali snažan parity dokaz, ali izvedene površine su pozivale različite visibility buildere ili ručno sastavljale scope. Counts, dashboard/SLA summary i search koristili su list scope posredno, group inbox vlastiti builder, a audit export zasebnu capability implementaciju. To je ostavljalo mogućnost da buduće izmjene promijene jednu površinu bez ostalih.

## Implementirani ugovor

Uveden je jedan canonical `buildTicketSurfaceVisibility` capability/predicate entrypoint sa eksplicitnim površinama:

- `detail`;
- `list`;
- `count`;
- `summary`;
- `search`;
- `group_inbox`;
- `audit_export`.

`detail/list/count/summary/search` dijele identičan read visibility predikat zasnovan na postojećem OU/service, requester, handler-group i confidentiality modelu. Group inbox je formalno samo narrowing canonical read vidljivosti sa queue uslovima. Audit export je zasebna eksplicitna capability grana koja zahtijeva `audit.export`, primjenjuje OU/service scope prije limita i uvijek isključuje confidential tickete.

Konkretne integracije:

- ticket list, a time i list search fast-path, koristi canonical `list` surface;
- dashboard/SLA counts i summary već grade scope kroz `buildTicketListWhere`, pa sada tranzitivno koriste isti canonical entrypoint;
- group inbox više ne poziva visibility builder direktno;
- export više ne održava ručno dupliciranu audit-export scope implementaciju;
- postojeći per-ticket detail oracle ostaje nezavisni referentni dokaz za canonical read predikat.

## Direktni dokaz

Nova generativna matrica `ticket-surface-visibility-parity.spec.ts` prolazi kroz sve aktore i confidentiality konfiguracije iz shared parity svijeta. Za svaku kombinaciju poredi kompletne ID populacije površina `detail/list/count/summary/search` i zahtijeva potpunu jednakost. Dodatno dokazuje da je svaki group-inbox rezultat podskup canonical read populacije.

Postojeći testovi nastavljaju dokazivati:

- jednakost canonical SQL where predikata i per-ticket authorization oraclea;
- audit-export OU/service/confidential scope prije limita;
- dashboard/SLA summary reuse list where ugovora;
- group inbox assignment i merged-ticket narrowing.

Puni CI `40362428376` je zelen za backend build/lint/unit testove, stvarne PostgreSQL/Redis integration suiteove, frontend, docs i container/supply-chain provjere. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**. Korisnik je potvrdio da je W5.15 migracija `20271026130000_saved_view_concurrency_invariants` uspješno primijenjena.

## Ishod

`BA-tickets-18` je zatvoren. Registar prelazi na **638 otvorenih / 54 zatvorena / 692 ukupno**.
