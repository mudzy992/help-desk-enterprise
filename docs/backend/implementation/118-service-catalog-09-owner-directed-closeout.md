# BA-service-catalog-09 closeout — optimistic concurrency

**Nalaz:** `BA-service-catalog-09` (P2) — **zatvoren owner-directed 2026-11-03**<br>
**Testani SHA:** `ee2e78c6c09a5a3633ab81aeef367a138c685b44`<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Odluka:** korisnik je izričito odobrio closeout nakon vlastite prijave uspješnog redeploya i primijenjene migracije.<br>
**Ciljna baza / redeploy:** korisnički prijavljeni, ali **nisu nezavisno provjereni**; iz ovog rada nije pristupljeno ciljnoj bazi i migracija nije ponovo pokretana.<br>
**Sljedeći scope:** `BA-service-catalog-13` (P3), ostaje otvoren nakon CI `41697055454` success; Perf `41697055530` je failure samo na nepovezanom search pragu, dok su service-catalog i query-budget passed. Dokaz je u [119 checkpointu](119-service-catalog-13-caller-supplied-change-reasons.md).

## Closeout dokaz

CI [`41662410362`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41662410362) na SHA `ee2e78c6c09a5a3633ab81aeef367a138c685b44` završio je **success**. Backend build/full Jest i audit-traceability, schema validation/generisanje Prisma Clienta, PostgreSQL/Redis integration (uključujući replay migracija na disposable CI bazi i real PostgreSQL suiteove), frontend build/test, docs guard, container/supply-chain i CI gate bili su **passed**. Korisnik je odvojeno prijavio uspješan redeploy i primijenjenu migraciju `20271030130000_service_catalog_optimistic_revisions`; ova prijava je osnova owner-directed statusne odluke, a ne nezavisni deployment ili target-DB dokaz.

U istom CI runu read-only service-form pattern inventory, E2E install wizard i E2E critical flows bili su **skipped**. U container/supply-chain jobu uslovni enforcement nultih high/critical image ranjivosti bio je **skipped**. Zato nema E2E/spec 56 sign-offa niti target-DB inventure izvedene ovim CI runom.

Odvojeni Perf smoke [`41662410321`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41662410321) je **failure**, ne pass: search p95 je bio **772.58 ms** prema `<500 ms`, a ticket-message p95 **1171.73 ms** prema `<1000 ms`. BA-service-catalog p95 **131.26 ms** prema `<500 ms` i query-budget prosjek **2.089** prema limitu `2.1` bili su **passed**. Search i ticket-message pragovi su nepovezani s BA-09 i nisu dio ovog closeouta. Spec 56/prag `250 ms` nije mijenjan.

## Opseg koji je prihvaćen

BA-09 je dodao optimistic `revision` i strong `If-Match` ugovor za service/category i service lifecycle/availability writeove, atomic revision CAS, stale-write odgovor i change-log `before`/`after` snapshot u istoj transakciji, revision propagation za direktne service writere uključujući onboarding, te frontend revision propagation, parser i lokalizaciju. Frontend `Service`/`ServiceCategory` response tipovi zahtijevaju revision; update zahtjevi šalju upravo učitanu revision. Pozitivni safe-integer parseri ostaju na service/category create/update i category detail/list putanjama; `getService` je ostao bez parsera prema ranijoj prihvatljivoj odluci.

Owner-directed zatvaranje ne mijenja nijedan drugi finding, `BA-routing-02`, spec 56, Perf pragove niti rollout/deployment stanje. Nije otvoren PR prema `master`, nije bilo mergea ni deployment akcije iz ovog closeouta. BA-13 se prati zasebno.
