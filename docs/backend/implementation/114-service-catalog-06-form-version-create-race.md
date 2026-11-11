# Implementacijski closeout — `BA-service-catalog-06` (owner-directed)

**Paket:** audit 15 / `service-catalog` — race kreiranja prve forme i narednih verzija<br>
**Nalaz:** `BA-service-catalog-06` (P2) — **zatvoren owner-directed 2026-11-02** nakon ispunjenja korisnikovog uslova da CI bude zelen<br>
**Grana / finalni testani SHA:** `arena/864951a6-help-desk-enterprise` / `964c8f49ee6ee4ffe1033baf389c9ecf64db1f12`<br>
**Migracija / ciljna baza:** nema schema promjene ni migracije; nije korištena ciljna baza<br>
**Spec 56 / prag:** nisu mijenjani; E2E/spec 56 sign-off nije ostvaren

## Finalni CI i odvojeni Perf rezultat

Finalni kodni CI [`41537673319`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41537673319) na SHA `964c8f4` je **success**. Backend generated-Prisma build, lint, full Jest, PostgreSQL/Redis integration (uključujući oba BA-06 real-PostgreSQL concurrency scenarija), frontend build/test, Docs guard, container/supply-chain i CI gate bili su **passed**.

Read-only service-form inventory, E2E install wizard, E2E critical flows i uslovni image-enforcement korak bili su **skipped**, ne passed. Nema browser/spec 56 sign-offa ni promjene praga `250 ms`.

Odvojeni Perf smoke [`41537673253`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41537673253) je **failure** samo na nepovezanom `POST /tickets/:id/messages` p95 **1151.73 ms** prema `<1000 ms`. Service-catalog p95 **385.05 ms** prema `<500 ms` i query-budget avg **2.090** prema `2.1` bili su **passed**; to nije BA-06 ili service-catalog Perf failure.

Početni CI [`41536256944`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41536256944) prošao je build/full Jest i ostale glavne jobove, ali je integration job pao na preuskoj aserciji koja je očekivala tačno tri audit reda; stvarni zbir je bio četiri. Asercija je prilagođena da provjerava potreban `form_version_create` događaj za svaku novu verziju, a finalni CI `41537673319` je prošao cijeli PostgreSQL/Redis integration job. Taj početni failure nije prikazan kao pass.

## Implementacija koja je zatvorena

- Prvo kreiranje ponovo provjerava postojeće forme unutar per-service zaključane transakcije; loser vraća HTTP 409 `FORM_ALREADY_EXISTS`.
- Kreiranje naredne verzije čita latest version nakon locka u `ReadCommitted` transakciji; klasifikovani `[serviceId, version]` unique conflict pokušava se ponovo u najviše tri svježe transakcije, a iscrpljenje vraća HTTP 409 `FORM_VERSION_CREATE_CONFLICT`.
- Sačuvani su BA-05 advisory-lock namespace i `FormVersion` `ROW EXCLUSIVE` table-lock ordering za aktivaciju, install-seed i snapshot writer kompatibilnost.
- Nema client idempotency-key ugovora ni obećanja replaya prethodnog uspješnog zahtjeva. Nema migracije.

## Status i naredni scope

BA-06 je zatvoren owner-directed prema korisnikovoj izričitoj dozvoli pod uslovom zelenog CI-ja. BA-07 je jedini naredni aktivni scope; početna implementacija je u [115 BA-07 checkpointu](115-service-catalog-07-downtime-overlap-race.md). BA-05 redeploy je i dalje samo korisnikova prijava, bez nezavisne deployment provjere. Nema novog PR-a, mergea ili deploymenta.
