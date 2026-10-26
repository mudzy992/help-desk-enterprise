# W5.20 — Scoped routing target authorization

**Finding:** `BA-routing-01`  
**Implementacija:** `2b8bfd5`, executable dokaz `c47f1fe`, harness korekcija `2575e47`  
**CI:** `40371361442` — zelen

## Problem

Create/update guardovi su autorizovali origin OU i service iz zahtjeva, ali nisu autorizovali OU kojem pripada delegation target grupa. `assertRoutingTargetsExist` je dokazivao samo postojanje `groupId`, a `/routing/groups` je vraćao sve grupe. Scoped routing administrator zato je mogao vidjeti i postaviti foreign-OU target.

## Implementirani ugovor

`isRoutingTargetGroupEligible` je jedinstveni ugovor koji zahtijeva:

1. `routing.write` assignment;
2. OU scope koji pokriva `group.organizationalUnit.ouPath`;
3. service scope koji pokriva service pravila kada se izvršava mutacija.

Globalni `routing.write` assignment (`OU=null`, `service=null`) i superadmin eksplicitno zadržavaju cross-OU mogućnost. Nije uvedena implicitna niti nova dedicated cross-OU dozvola.

Create i update prije upisa učitavaju target group OU i authorization context aktora te koriste isti predicate. `/routing/groups` koristi isti predicate bez konkretnog service filtera, pa vraća samo grupe koje viewer smije koristiti za barem svoj autorizovani routing scope. Read-only assignment ne dobija settable target grupe.

## Izvršivi dokaz

Dodani testovi dokazuju:

- odbijanje foreign-OU targeta na create;
- odbijanje istog targeta na update kroz isti ugovor;
- odbijanje service mismatcha i read-only assignmenta;
- filtriran `/routing/groups` rezultat za scoped viewer;
- puni rezultat za globalno scoped administratora i superadmina.

Postojeći controller guard dokaz nastavlja pokrivati origin OU/service. Novi service dokaz pokriva delegation target koji controller metadata ranije nije mogla sigurno modelirati bez prepisivanja scope locatora.

## CI dokaz

CI `40371361442` je potpuno zelen: backend build/lint/svi unit suiteovi, real PostgreSQL/Redis integration shard, frontend, docs i container/supply-chain poslovi su prošli. Puni E2E critical flow nije pokrenut jer paket nema browser flow niti opravdanje za SMTP/ticket trošak.

## Migracija

Paket **nema novu DB migraciju**.

## Ishod

`BA-routing-01` je zatvoren. Registar prelazi na **636 otvorenih / 56 zatvorenih / 692 ukupno**.
