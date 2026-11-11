# W6.19 — BA-notifications-02: neposredni deny nakon opoziva članstva

**Status:** zatvoreno na nivou nalaza; Val 6 kao cjelina ostaje otvoren.
**BA ID:** `BA-notifications-02` (P1).
**Branch:** `arena/864951a6-help-desk-enterprise`.
**Finalni testani SHA:** [`390ad86`](https://github.com/mudzy992/help-desk-enterprise/commit/390ad8608521eb5f37bf2af7a424d669194b742b) (kodna implementacija u roditeljskom [`10b2e47`](https://github.com/mudzy992/help-desk-enterprise/commit/10b2e474d547250ed28f259d3f18accebecbb1e8)).

## Problem i acceptance

Stari 30-sekundni process `WeakMap` cache membershipa mogao je na drugoj aplikacijskoj instanci nastaviti sastavljati grupni notification audience nakon što je članstvo opozvano. Acceptance je: zagrijati taj cache, ukloniti membership kao da je promjena napravljena na drugoj instanci, pa bez TTL čekanja dokazati deny za notification list/count/mark i Edge receipt; zagrijan Redis unread-count ne smije vratiti broj za staru grupnu publiku.

## Implementacija

- `loadActorGroupMembershipsAuthoritatively` čita aktuelne `GroupMember` redove direktno iz baze i namjerno zaobilazi process cache. Vraća `id`, `groupId` i `createdAt`; `loadNotificationAudience` koristi taj loader za notification autorizaciju.
- Notification list/count/mark-one/mark-all i Edge `recordReceipt` koriste isti authoritative audience predicate. List i njegov unread count dijele isti membership snapshot unutar zahtjeva.
- Redis unread-count vrijednost je vezana za deterministički fingerprint tačnog membership skupa (membership row ID, group ID i join time) pored group epochova. Promjena ili remove/re-add membershipa zato pravi cache miss i svježi count; prazan audience također koristi audience-bound entry, a stari entry bez fingerprinta se odbacuje.
- Nema promjena schema/migracija; ne mijenjaju se Perf pragovi.

## Regresijski acceptance

- `notifications.inbox.spec.ts`: zagrijan scope cache ostaje namjerno zastario nakon simulirane udaljene revokacije, dok notification list/count odbijaju grupni sadržaj; mark-one vraća `NOT_FOUND`, a mark-all ne upisuje grupni receipt.
- `notifications.membership-cache.spec.ts`: zagrijan Redis unread badge se ne vraća nakon promjene membershipa; count se ponovo računa bez grupnog audiencea.
- `unread-count-cache.epochs.spec.ts`: provjerava audience fingerprint, membership promjenu i epoch invalidaciju.
- `edge-extension.service.spec.ts`: prvo se zagrije membership cache i prihvati grupni receipt, zatim se ukloni članstvo; cache i dalje sadrži stari membership, ali Edge receipt odmah dobije `NOT_FOUND` i ne emituje drugi audit receipt.

## Provjere i granice

- `git diff --check` prošao; ciljane Prettier provjere su pokrenute za nove/prepisane testne fajlove. Lokalni backend Jest nije bio dostupan u checkoutu bez `node_modules` i generisanog Prisma klijenta.
- Automatski finalni CI [`42088943970`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42088943970) na SHA `390ad86` je **success**: generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration, frontend build/test, docs guard, container/supply-chain i CI gate prošli su.
- E2E critical flows, install wizard i read-only service-form inventory bili su `skipped`; nisu predstavljeni kao passed. BA-15 full critical-flow acceptance ostaje zasebno pending.
- Novi Perf smoke nije pokrenut: notification/Edge putanje nisu u aktuelnom push path filteru Perf workflowa. Prethodni BA-01 Perf run nije dokaz za BA-02. Nisu ručno dispatchani CI/E2E/Perf testovi.
- Nije korištena ciljna baza, nije pokretana migracija, nije otvoren PR, nije bilo mergea ni deploymenta.

## Odluka i preostali scope

Acceptance za `BA-notifications-02` je zadovoljen i nalaz je zatvoren. Notifications sada ima **2/15** zatvorenih nalaza; `BA-notifications-03`–`15` ostaju otvoreni. Val 6 je **21/109** zatvorenih i **88 otvorenih** (19 P1 / 49 P2 / 20 P3), pa se ne označava završenim. Baseline audit score 5,05/10 nije rescoraan.
