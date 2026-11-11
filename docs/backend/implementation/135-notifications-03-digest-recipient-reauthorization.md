# W6.20 — BA-notifications-03: recipient reauthorization prije digest rendera

**Status:** zatvoreno na nivou nalaza; Val 6 kao cjelina ostaje otvoren.
**BA ID:** `BA-notifications-03` (P1).
**Branch:** `arena/864951a6-help-desk-enterprise`.
**Finalni kodni/testani SHA:** [`aaf5ea1`](https://github.com/mudzy992/help-desk-enterprise/commit/aaf5ea1ef747144a06dc9a754af2a5159270414e).

## Problem i acceptance

Held digest item pamti user/ticket, ali je kasniji worker ranije učitavao aktuelne ticket činjenice samo po ID-u. Promjena requester/assignee/group/OU/role ili confidential accessa između eventa i digesta nije ponovo primjenjivala ticket visibility politiku. Ista direktna putanja postojala je u test-digest slanju.

Acceptance iz audita 17 §13: prije renderovanja batch-provjeriti aktuelnu visibility svakog held ticket ID-a za primaoca; denied held item obrisati i evidentirati agregatni, audit-safe razlog bez ticket činjenica; ako se authorization pouzdano ne može provjeriti, ne slati digest. Test-digest mora primijeniti istu provjeru.

## Implementacija

- `PrincipalContextLoader.loadAuthoritatively` pruža cache-bypass učitavanje trenutnog principal/roles/group-membership snapshot-a iz baze. `AuthorizationContextLoader.loadAuthoritativeSnapshotBySubjectId` pretvara ga kroz postojeći `createAuthorizationContext` i za digest vraća aktuelne group ID-jeve bez request/Redis/process membership cachea.
- Digest učitava aktuelne OU scope redove direktno iz baze i koristi centralni `buildTicketSurfaceVisibility` sa `surface: 'detail'`; status/search/list-only narrowing se ne dodaje.
- Po primaocu se ticket ID-jevi iz held batcha queryjaju jednim `ticket.findMany` pozivom uz centralni visibility predicate. Ticket facts se zato učitavaju samo za primaoca trenutno vidljive tickete; stavke za nedostajuće ili denied tickete izostaju iz composer ulaza.
- Prije compose/send uklanjaju se svi denied held rows. Worker loguje samo agregatni `items_dropped_for_access` broj sa razlogom `ticket_visibility_denied`; ne loguju se user ID, ticket ID, title, status niti druga ticket činjenica. Test-send uklanja iste denied held rows i loguje samo agregatni broj/razlog.
- Kvar confidential-config/principal/OU/ticket visibility čitanja je fail-closed: normalni digest ne renderuje niti šalje i held stavke ostaju za retry; test-send vraća `TICKET_VISIBILITY_UNAVAILABLE` i ne šalje poruku. Worker/API DI je povezan preko authorization modula i `TicketConfidentialConfigurationLoader`-a; loader je izvezen iz `TicketsModule`.
- Nema schema promjene ni nove migracije.

## Regresijski acceptance

- `notification-digest.service.spec.ts` zagrijava grupni membership scope cache, uklanja članstvo i odmah izvršava digest. Stale cache ostaje dostupan u request contextu, ali authoritative principal/group snapshot iz baze izostavlja grupu; ticket query ne sadrži group grant, held item se briše, digest se ne šalje i composer ne dobija ticket facts.
- Zaseban test zagrijava isti cache i ponavlja revocation kroz `sendTest`; denied item se briše, a composer dobija prazan item/ticket skup.
- Failure testovi dokazuju da authz read kvar u normalnom i test-digest toku ne šalje e-mail; normalni held item ostaje za retry.
- Postojeći due/quiet digest, disabled channel, provider block, deactivated user i delivery failure testovi ostaju pokriveni.

## Provjere i granice

- Ciljani Prettier `--check` i `git diff --check` prošli su. Lokalni backend Jest nije pokrenut jer checkout nema `node_modules` ni generisani Prisma klijent.
- Automatski CI [`42096685123`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42096685123) na kodnom SHA `aaf5ea1` je **success**: generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration, frontend, docs guard, container/supply-chain i CI gate prošli su.
- E2E critical flows, install wizard i read-only service-form inventory bili su `skipped`; nisu predstavljeni kao passed. Perf smoke nije pokrenut jer notification digest putanje nisu u njegovom push path filteru; pragovi nisu mijenjani.
- Nije korištena ciljna baza, nije pokretana migracija, nije otvoren PR, nije bilo mergea ni deploymenta.

## Odluka i preostali scope

Acceptance za `BA-notifications-03` je zadovoljen i zatvoren je samo ovaj nalaz. Notifications sada ima **3/15** zatvorenih nalaza; `BA-notifications-04`–`15` ostaju otvoreni. Val 6 je **22/109** zatvorenih i **87 otvorenih** (18 P1 / 49 P2 / 20 P3), pa se ne označava završenim. Status-page 29 ostaje 19/19. Baseline audit score 5,05/10 i zasebni BA-15 full critical-flow pending status ostaju nepromijenjeni.
