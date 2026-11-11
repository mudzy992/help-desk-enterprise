# W6.42 — `BA-on-call-02`: swap interval vezan za requesterovu smjenu

**Status:** `BA-on-call-02` zatvoren na finding nivou nakon zelenog push-triggered CI-ja.  
**Scope:** samo Val 6 P1 `BA-on-call-02`; P2/P3, `BA-on-call-03`, announcements i BA-15 full acceptance nisu dio ovog closeouta.  
**Datum:** 2026-10-29

## Korekcija

`requestSwap` sada učitava schedule context za traženi raspon i poziva segment-resolver nad cijelim half-open intervalom `[startsAt, endsAt)`. Zahtjev prolazi samo ako segmenti bez rupe pokrivaju tačno traženi raspon, svaki ima `userId === requesterId` i `source: "rotation"`.

Partial i puna requesterova rotation smjena su dozvoljene. Zahtjev se odbija kada period pripada drugom članu, prelazi rotation handoff u tuđu smjenu, uključuje uncovered vrijeme, raspored/requester nije aktivan/raspoloživ ili se bilo gdje preklapa s postojećim overrideom. Colleague mora biti drugi aktivan, neanonimizovan član iste rotacije. Override lookup je ograničen na traženi `[from, to)` prozor; UI i bs/en locale poruke objašnjavaju interval pravilo.

Ovaj finding ne zatvara concurrent schedule-save P1 niti accept-time membership/schedule-version revalidation P2. Request validation i create nisu uvedeni kao novi serializable schedule-edit protocol.

## Testovi i CI

Novi service spec pokriva prihvaćen partial period i kompletnu sedmodnevnu WEEK smjenu; odbacivanje tuđe smjene, handoffa prema drugom članu, vremena prije rotation starta, neaktivnog rasporeda/nedostupnog requestera i existing third-person overridea. Override test provjerava tačne half-open DB query granice i da odbijanje ne pokreće transaction/create. UI spec potvrđuje interval hint.

Lokalno: on-call ciljane suite **7/7, 37/37** uz ts-jest dijagnostiku isključenu jer lokalni generated Prisma client nedostaje; backend ESLint; frontend Vitest **2/2**, ESLint i `i18n:check` prošli. Generated-Prisma typecheck i puni Jest potvrđeni su u CI, ne lokalno.

Commit [`31cd058`](https://github.com/mudzy992/help-desk-enterprise/commit/31cd0582469ce2c904864bfcde42da7c031cbf90) prošao je push-triggered CI [`42518032045`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42518032045) (**success**): backend generated-Prisma build/full Jest, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain job i CI gate. Read-only inventory, E2E install wizard, E2E critical flows i conditional high/critical image enforcement bili su `skipped`, ne `passed`.

## Granice i status

- Nije dodana Prisma migracija ni korištena ciljna baza; CI integration/migration replay koristi disposable environment.
- Nije otvoren PR, izvršen merge ili deployment.
- Nakon W6.42 Val 6 je **46/109 zatvorenih, 63 otvorena (5 P1 / 41 P2 / 17 P3)**. Izvorni auditi/generisani plan: **515 otvorenih / 177 zatvorenih**; globalni registar: **525 otvorenih / 167 zatvorenih**. Deset ranijih razlika između source audita i registra nije mijenjano.
- Preostali Val 6 P1 su `BA-on-call-03` i `BA-announcements-01/02/03/04`; P2/P3 i BA-15 full critical-flow acceptance ostaju izvan scopea/pending.
