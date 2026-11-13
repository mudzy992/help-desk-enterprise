# Problem lifecycle — regresija audit scopea

U CI runu 43400569937 E2E 30 dobio je INTERNAL_ERROR; prijavljeni runtime log zasebnog ručnog kreiranja potvrđuje `AUDIT_SCOPE_REQUIRED:problem.created`. Producer je stavljao jedinicu samo u metadata, ali audit policy zahtijeva eksplicitni top-level `organizationalUnitId` i pripadajuću OU particiju. Kreiranje problema u istoj transakciji nije uspjelo.

Ispravka prosljeđuje jedinicu samog problema za kreiranje, statusne prelaze, automatsko zatvaranje, kreiranje članka i grupno rješavanje tiketa. Tri statusne audit akcije sada eksplicitno dozvoljavaju postojeće `from`, `to`, `reason` metapodatke; pravilo obaveznog OU scopea ostaje aktivno. Testovi pozivaju stvarni audit validator i za create/status/sweep stvarni append kroz mock transakciju; dodatni testovi resolution provjeravaju scope i validator. Nisu zamjena za PostgreSQL/browser E2E. Ne dodaje se migracija.

Odvojeno, E2E 57/58 su u istom runu dobili `ECONNREFUSED` lokalnog tunela; SSH step je bio uspješan ranije. Tačan uzrok prekida nije utvrđen. Keepalive je preventivna mjera, ne dokaz oporavka ni garancija da će tunel ostati živ.
