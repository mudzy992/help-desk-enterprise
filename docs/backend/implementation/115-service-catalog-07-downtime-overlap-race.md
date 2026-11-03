# Closeout — `BA-service-catalog-07` (zatvoreno owner-directed)

**Paket:** audit 15 / `service-catalog` — concurrency-safe downtime overlap invariant<br>
**Nalaz:** `BA-service-catalog-07` (P2) — **zatvoreno owner-directed** 2026-11-03 nakon izričite korisničke dozvole uz zelene CI/Perf runove<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Odluka:** korisnik je 2026-11-03 izričito odobrio BA-07 zatvaranje jer su CI i Perf prošli, te naložio početak BA-08<br>
**BA-07 kod/test commit:** `65bad6e7f5e6d37a9964364e77615e7f0b392a83` (`test(service-catalog): fix BA-07 test type errors`), pushed na aktivnu Arena granu<br>
**BA-06 prethodni status:** zatvoren owner-directed nakon zelenog CI-ja `41537673319` na `964c8f4`; detalji i odvojeni Perf/E2E statusi su u [114 BA-06 closeoutu](114-service-catalog-06-form-version-create-race.md).<br>
**Kontrolni zbir nakon zatvaranja:** deklarisano 560 otvoren / 132 zatvoren / 692 ukupno; machine-readable 563 otvorena / 118 zatvorenih / 11 historijskih; `service-catalog` 5 otvorenih / 10 zatvorenih. Preegzistentna razlika od tri statusa ostaje dokumentovana.<br>
**Migracija / ciljna baza:** nema schema promjene ni migracije; ciljna baza nije korištena<br>
**Spec 56 / prag:** nisu mijenjani; E2E poslovi su skipped, nema browser/spec 56 sign-offa

## Nalaz i acceptance

Audit 15 utvrdio je da downtime overlap trenutno provjerava postojeće prozore prije transakcije. Dva istovremena create/update zahtjeva ili API mutacija naspram scheduled-change synca mogu zato provjeriti isti stari skup redova i upisati preklapanje.

Acceptance ovog paketa:

1. API create i update koriste isti transaction-scoped advisory lock po servisu; overlap query se izvršava tek nakon locka u `ReadCommitted` transakciji. Update ponovo učitava trenutni red nakon locka, pa od njega računa izostavljena polja.
2. Change-schedule downtime sync zaključava sva relevantna service ID-jeva determinističkim redoslijedom prije čitanja stranih downtime prozora i prije create/update writes. BA-11 outbox/event semantika i status ne mijenjaju se.
3. Istovremeni overlap pokušaj daje tačno jedan uspješan write, dok gubitnik dobija postojeći stabilni HTTP 409 `OVERLAPPING_DOWNTIME_WINDOW`. Poluotvoreni `[startsAt, endsAt)` ugovor ostaje: susjedni prozori su dozvoljeni.
4. Real PostgreSQL integration pokriva create-vs-create, update-vs-create i `ChangeScheduleService.syncDowntime`-vs-API-create trke; potvrđuje da su konačni prozori nepreklapajući, API loser dobija 409, a API create se evidentira u change logu.

Nema DB exclusion constraint ni migracije; konkurenciju koordinira postojeći `DatabaseLockService`. BA-08 nije bio dio BA-07 implementacije i sada počinje kao zaseban scope u [116 checkpointu](116-service-catalog-08-category-parent-cycle-race.md). Ostali nalazi nisu mijenjani.

## Implementacija

- Novi helper `withServiceDowntimeWindowMutationLock(s)` koristi per-service namespace `service-catalog.downtime-window`; multi-service sync sortira i deduplicira ID-jeve radi izbjegavanja lock-order deadlocka.
- `createServiceDowntimeWindow` premješta overlap read iza locka; insert i audit zapis ostaju u istoj transakciji.
- `updateServiceDowntimeWindow` učitava trenutni red, provjerava overlap i zapisuje update/audit unutar iste zaključane transakcije.
- `ChangeScheduleService.syncDowntime` uzima iste lockove prije foreign-window queryja i plan/apply koraka; ostaje u postojećoj transakciji i eksplicitno koristi `ReadCommitted`.
- Dodani su helper testovi, sync-lock assertion, isolated PostgreSQL suite za tri race scenarija (API create/create, API update/create, change-sync/API create) i runner registry guard.
- Početni commit `8c29771c` implementirao je BA-07. Follow-up commit `65bad6e7` ispravio je dvije test-tipizacije koje su otkrili prvi CI pokušaj; poslovna logika nije mijenjana u tom follow-upu.

## Verifikacija

- Finalni CI [`41628259091`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41628259091), SHA `65bad6e7`: **success**. Backend generated-Prisma build, lint i puni Jest (`npm test -- --ci --coverage=false`) prošli su; PostgreSQL/Redis integration job, uključujući BA-07 race suite, prošao je. Docs guard, frontend build/test, container/supply-chain poslovi i CI gate također su **passed**.
- U istom CI runu E2E install wizard, E2E critical flows i read-only service-form inventory bili su **skipped**. Uslovni `Enforce zero high/critical image vulnerabilities` korak također je **skipped**. Skip nije pass; nema browser/spec 56 sign-offa.
- Odvojeni Perf smoke [`41628258814`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41628258814), SHA `65bad6e7`: **success**. K6 latency/error/service-catalog pragovi prošli su; database query budget avg **2.095** prema limitu **2.1** (p95 **7**, max **34**). Konkretno service-catalog p95 `<500 ms` i ticket-message p95 `<1000 ms` pragovi su **passed**. Prag speca 56 od `250 ms` nije mijenjan niti korišten kao waiver.
- Prvi CI run [`41627226658`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41627226658) na `8c29771c` završio je **failure**: `service-catalog.availability.spec.ts` imao je TS2345 na `Object.create(unknown)`, a BA-07 integration suite TS2339 jer `ServiceResponse` nema `serviceId`. Follow-up commit ispravio je obje tipizacije (`client as object`, assertion preko `existing.id`); oba CI koraka su zatim prošla u `41628259091`. Prvi PostgreSQL run nije došao do runtime race testova jer TypeScript kompilacija pala.
- Prvi Perf run [`41627226595`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41627226595) završio je **failure**: query-budget avg **5.257** prema limitu **2.1** uz više latency/error gateova izvan praga. Sljedeći Perf run `41628258814` na ispravljenom test commit-u prošao je. Ovaj checkpoint bilježi oba rezultata; iz prvog perf neuspjeha ne izvodi se uzročna tvrdnja o BA-07.
- Prije push CI-ja prošli su lokalni targeted unit testovi (**11/11**), izolovani integration registry/harness testovi (**3/3**), traceability **692/692**, docs guard i registry testovi (**13/13**). Lokalni checkout nema generated Prisma Client, pa lokalni `npm run build` nije bio valjan backend typecheck; finalni generated-client build i puni testovi potvrđeni su CI-jem. Lokalni `DATABASE_URL` i `E2E_DATABASE_URL` nisu bili postavljeni; target DB-u nije pristupano niti je lokalna migracija pokretana.
- `git diff --check` je prošao prije commitova; follow-up je pushan samo na `arena/864951a6-help-desk-enterprise`.

## Status i sljedeći korak

BA-07 je **zatvoren owner-directed** nakon korisnikove izričite dozvole nakon zelenog CI `41628259091` i Perf `41628258814` na `65bad6e7`. CI je prošao generated-Prisma build/lint/full Jest i PostgreSQL/Redis integration; Perf pragovi su prošli. E2E/install/critical, inventory i conditional image-enforcement bili su skipped, pa nema browser/spec 56 sign-offa. BA-08 je sljedeći aktivni scope u checkpointu 116. Nije bilo PR-a prema `master`, mergea, deploymenta ni target-DB akcije. Nema schema migracije, promjene BA-routing-02, drugih finding statusa, speca 56, praga `250 ms` ili W7.15 ponašanja.
