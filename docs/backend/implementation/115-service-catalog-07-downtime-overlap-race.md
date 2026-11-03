# Implementacijski checkpoint — `BA-service-catalog-07` (u toku)

**Paket:** audit 15 / `service-catalog` — concurrency-safe downtime overlap invariant<br>
**Nalaz:** `BA-service-catalog-07` (P2) — **otvoren**; implementacija započeta, PostgreSQL acceptance čeka<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**BA-06 prethodni status:** zatvoren owner-directed nakon zelenog CI-ja `41537673319` na `964c8f4`; detalji i odvojeni Perf/E2E statusi su u [114 BA-06 closeoutu](114-service-catalog-06-form-version-create-race.md).<br>
**Kontrolni zbir poslije BA-06:** deklarisano 561 otvoren / 131 zatvoren / 692 ukupno; machine-readable 564 otvorena / 117 zatvorenih / 11 historijskih; `service-catalog` 6 otvorenih / 9 zatvorenih. Preegzistentna razlika od tri statusa ostaje dokumentovana.<br>
**Migracija / ciljna baza:** nema schema promjene ni migracije; ciljna baza nije korištena<br>
**Spec 56 / prag:** nisu mijenjani; nema browser/spec 56 sign-offa

## Nalaz i acceptance

Audit 15 utvrdio je da downtime overlap trenutno provjerava postojeće prozore prije transakcije. Dva istovremena create/update zahtjeva ili API mutacija naspram scheduled-change synca mogu zato provjeriti isti stari skup redova i upisati preklapanje.

Acceptance ovog paketa:

1. API create i update koriste isti transaction-scoped advisory lock po servisu; overlap query se izvršava tek nakon locka u `ReadCommitted` transakciji. Update ponovo učitava trenutni red nakon locka, pa od njega računa izostavljena polja.
2. Change-schedule downtime sync zaključava sva relevantna service ID-jeva determinističkim redoslijedom prije čitanja stranih downtime prozora i prije create/update writes. BA-11 outbox/event semantika i status ne mijenjaju se.
3. Istovremeni overlap pokušaj daje tačno jedan uspješan write, dok gubitnik dobija postojeći stabilni HTTP 409 `OVERLAPPING_DOWNTIME_WINDOW`. Poluotvoreni `[startsAt, endsAt)` ugovor ostaje: susjedni prozori su dozvoljeni.
4. Real PostgreSQL integration pokriva create-vs-create, update-vs-create i `ChangeScheduleService.syncDowntime`-vs-API-create trke; potvrđuje da su konačni prozori nepreklapajući, API loser dobija 409, a API create se evidentira u change logu.

Nema DB exclusion constraint ni migracije; konkurenciju koordinira postojeći `DatabaseLockService`. BA-08 i svi drugi nalazi ostaju van scopea.

## Implementacija

- Novi helper `withServiceDowntimeWindowMutationLock(s)` koristi per-service namespace `service-catalog.downtime-window`; multi-service sync sortira i deduplicira ID-jeve radi izbjegavanja lock-order deadlocka.
- `createServiceDowntimeWindow` premješta overlap read iza locka; insert i audit zapis ostaju u istoj transakciji.
- `updateServiceDowntimeWindow` učitava trenutni red, provjerava overlap i zapisuje update/audit unutar iste zaključane transakcije.
- `ChangeScheduleService.syncDowntime` uzima iste lockove prije foreign-window queryja i plan/apply koraka; ostaje u postojećoj transakciji i eksplicitno koristi `ReadCommitted`.
- Dodani su helper testovi, sync-lock assertion, isolated PostgreSQL suite za tri race scenarija (API create/create, API update/create, change-sync/API create) i runner registry guard.

## Verifikacija do sada

- Ciljani ESLint nad BA-07 TypeScript i runner fajlovima: **passed**.
- Service-availability API, advisory-lock helper i `ChangeScheduleService` downtime unit testovi: **11/11 passed** (lokalni `ts-jest` diagnostics workaround).
- Isolated-integration registry/harness testovi: **3/3 passed**; BA-07 suite je registrovan u runneru.
- Docs content guard: **passed**; backend findings traceability **692/692**, izvorni registry testovi **13/13 passed**; `git diff --check` **passed**.
- Lokalni `npm run build` nije mogao validirati paket: Prisma client na `backend/src/generated/prisma/client` nedostaje, pa TypeScript prijavljuje **3.388** kaskadnih dijagnostika. Ovo nije build pass; generated-client CI build je i dalje potreban.
- Real PostgreSQL BA-07 suite još nije izvršen; lokalni `DATABASE_URL`, `E2E_DATABASE_URL` i `PRIVACY_IT_DATABASE_URL` nisu bili izloženi procesu. Potrebni su generated-Prisma CI build/full Jest i disposable PostgreSQL concurrency run.

## Status i sljedeći korak

BA-07 ostaje **otvoren** do generated-client build/full Jest, real PostgreSQL concurrency suite i ostalih potrebnih CI gateova. Ne praviti PR prema `master`, merge ili deployment bez zasebne dozvole. Nema ciljane DB migracije, promjene BA-routing-02, drugih finding statusa, speca 56, praga `250 ms` ili W7.15 ponašanja.
