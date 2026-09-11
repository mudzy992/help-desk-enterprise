# CHANGELOG — ticket-confidential-visibility

- 2026-09-11: Per-ticket confidential ACL na postojećem RBAC/OU/service evaluatoru. SuperAdmin samo kroz break-glass (reason + `BreakGlassEvent` + ChangeLog). Liste ne curiju naslov/opis. Poruke i prilozi idu kroz isti `loadAccessibleTicket` gate.
