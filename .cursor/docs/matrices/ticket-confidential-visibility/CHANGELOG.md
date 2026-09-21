# CHANGELOG — ticket-confidential-visibility

- 2026-09-11: Per-ticket confidential ACL na postojećem RBAC/OU/service evaluatoru. SuperAdmin samo kroz break-glass (reason + `BreakGlassEvent` + ChangeLog). Liste ne curiju naslov/opis. Poruke i prilozi idu kroz isti `loadAccessibleTicket` gate.

## 2026-09-21
- Lista tiketa primjenjuje ACL kao `where` predikat (bez petlje po tiketu); pravila nepromijenjena, uključujući aktivan break-glass kao izvor vidljivosti. Paritet čuva `build-ticket-visibility-where.spec.ts`.
