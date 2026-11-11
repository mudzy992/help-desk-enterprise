# Package closeout — `BA-service-catalog-10`

**Paket:** audit 15 / bounded service-catalog reads<br>
**Nalaz:** `BA-service-catalog-10` (P2) — zatvoren owner-directed odlukom; globalni Perf/E2E green sign-off nije tvrdnja<br>
**Kodni commit:** `039992064bfea250d95a1b8fc177b59dd3bdf239`<br>
**Finalni testani SHA:** `039992064bfea250d95a1b8fc177b59dd3bdf239`<br>
**CI:** [`41431538084`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41431538084) — CI gate zelen<br>
**Perf:** [`41431538128`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41431538128) — puni smoke nije zelen; BA-10 service gates prošli<br>
**DB migracije:** nema BA-10 schema promjene ni migracije; nije korištena ciljna baza

## Nalaz i acceptance

`BA-service-catalog-10` pokrivao je resource-unbounded service/category/form/downtime čitanja. Implementacija dodala je paginirane/envelope readove, stabilne cursor/filter ugovore, response-byte granice, period overlap filter za downtime, form summary/projection i bounded frontend potrošače. Generisani-Prisma PostgreSQL suite obuhvata 500 servisa, 126 kategorija, 75 form verzija i 125 downtime prozora unutar perioda plus dva izvan perioda.

Vlasnik je izričito odlučio zatvoriti samo BA-10 i ne dopustiti da nepovezani ticket-message/search Perf pragovi zadrže nalaz otvorenim. Ovo je owner-directed status acceptance, **ne** tvrdnja da je puni Perf smoke ili E2E zelen, niti waiver za neuspjehe ili mijenjanje pragova. Root cause ranijeg spec-56 `/services` long-taska nije potvrđen. Spec 56, njegova očekivanja i prag od 250 ms nisu mijenjani, preskočeni ni oslabljeni.

## Implementacija

- Service, category, form-history i downtime readovi imaju bounded pagination, determinističan poredak, `total`/`hasMore` gdje važi, cursor/filter binding i response-size limit.
- Katalog UI učitava stranice sa eksplicitnim limitom; aktivna forma se u catalog summary vraća kao sažetak, dok ticket-create koristi poseban read jedne aktivne scheme.
- Downtime list filtrira period preklapanja, ograničava period na 730 dana, a runtime availability čita bounded skup prozora i agregat.
- API i frontend potrošači moraju se rolloutati kompatibilno; rollback je aplikacijski revert/pin na prethodni SHA. Nema DB rollback koraka.
- Izvan scopea ostaju nalazi 01–09 i 11–15, posebno `BA-service-catalog-11`; susjedni `BA-changes-*`, ticket-message i search nalazi nisu zatvarani ni mijenjani.

## Direktni testni dokaz

- `backend/src/modules/service-catalog/service-catalog-pagination.integration.spec.ts` — 4 real-PostgreSQL testa za envelope/cursor, totals, stabilan redoslijed, downtime period, byte limit i katalog statement caps. Page-read granice su service `≤10`, category `≤2`, form `≤5`, downtime `≤3` SQL statementa; ovo je katalog sloj, ne puni HTTP auth/principal-context trošak.
- Disposable Perf fixture seeded je sa 500 ACTIVE servisa. BA-10 Perf scenarij koristio je 10 VU-a u postojećem 200-VU profilu, bez reweightanja, te je provjeravao service response contract, payload-byte limit i postojeći read p95 prag.
- U Perf HTTP telemetry `/services` je zabilježeno prosječno 10.002 SQL/request uključujući auth/principal-context upite; ovo se ne predstavlja kao katalog page-read cap.

## CI i testni dokaz

CI run [`41431538084`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41431538084) na SHA `039992064bfea250d95a1b8fc177b59dd3bdf239`:

- **Backend:** build/lint/Jest prošli.
- **PostgreSQL/Redis integration:** prošao; BA-10 PostgreSQL suite je registrovan i izvršen.
- **Frontend:** build/test prošli.
- **Docs/container/CI gate:** Docs guard, container/supply-chain job i ukupni CI gate prošli.
- **Skipped:** `E2E critical flows`, `E2E install wizard` i container image high/critical vulnerability enforcement bili su `skipped`; nisu passed. Perf je odvojen od ovog CI runa.
- **Perf smoke:** run [`41431538128`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41431538128) na istom SHA-u završio je **failure** na ticket-message p95 `1320.14 ms` prema limitu `<1000 ms` i search p95 `505.82 ms` prema limitu `<500 ms`. BA-10 `/services?take=100` p95 `42.00 ms` (limit `<500 ms`), payload p95/max `111.16 KB`, 1.200 zahtjeva i response-contract gate prošli su. Global query average `2.093` kroz `48.044` zahtjeva (limit `2.1`), query p95 `7`, max `34` također su prošli. Neuspjesi ticket/search ostaju vidljivi i nisu istraživani ili mijenjani u ovom paketu.
- **Neuspjeli raniji pokušaji:** CI [`41428351803`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41428351803) na SHA `741be78168055214a5800b2592f545cb3909388b` pao je na Prisma query-event tipu (`TS2345`) i zastarjelom YAML self-testu; oba su popravljena. CI [`41429752590`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41429752590) na SHA `1708fd53c05bf526f0aed22e40bdc36191f62f32` zatim je prošao, uz iste E2E/enforcement skips. Perf [`41428351666`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41428351666) pao je na search p95 `539.15 ms`; Perf [`41429752537`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41429752537) prošao je sve pragove. Kasniji `41431538128` je zasebni novi crveni puni smoke, kako je navedeno iznad.
- **E2E status:** finalni push CI E2E poslovi su skipped, ne passed. Raniji dispatch [`41420600750`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41420600750), na starijem SHA `0b1824faecba34f0c624a81c0ad8d4fbbca19a4e`, imao je 6 passed / 2 failed; oba pada u specu 56 bila su na početnoj navigaciji. Nema potvrđene uzročnosti BA-10 koda. Raniji `workflow_dispatch` pokušaj bio je odbijen HTTP 403.

Dodatne lokalne provjere: workflow YAML testovi **11/11**, docs guard testovi **9/9**, docs content guard **32 stranice / 8 prevoda / 10 provjera**, integration harness **3/3**, ciljano lint/Prettier i `git diff --check` prošli su. Lokalni Prisma Client generation bio je blokiran TLS pristupom `binaries.prisma.sh`; lokalno nisu bili dostupni `k6`, Docker ni `psql`. To su sandbox ograničenja, ne zamjena za prolazne CI PostgreSQL testove. Širi Prettier check prijavio je preegzistentne razlike u nepovezanim Perf/backend fajlovima; nisu masovno formatirani.

## Registar nalaza

- Zatvoren: samo `BA-service-catalog-10` (P2), po izričitoj owner-directed odluci.
- Ostaju otvoreni: 14 preostalih service-catalog nalaza, uključujući `BA-service-catalog-11`; svi ostali nalazi ostaju nepromijenjeni.
- Kontrolni zbir: **569 otvorenih / 123 zatvorena / 692 ukupno** (deklarisani zbir). Machine-readable redovi: **572 otvorena / 109 zatvorenih / 11 historijskih / 692 ukupno**; ranija razlika od tri statusa ostaje zaseban posao.
- Ukupan severity inventar ostaje P1 `174`, P2 `368`, P3 `150`; promijenjen je samo status BA-10, ne severity niti ukupni broj nalaza.

## Migracija, rollout i rollback

Nema schema promjene, migracije ili ciljne DB primjene. CI je koristio disposable PostgreSQL/Redis okruženje. Rollout zahtijeva usklađeni backend/frontend deploy zbog response-envelope promjena; rollback je revert/pin aplikacijskog SHA-a i vraćanje kompatibilnog frontend paketa. Nije izvršen DB rollback.

## Sljedeći paket

**`BA-service-catalog-11` (P2):** durable retry/reconciliation za change-owned downtime. Sljedeći rad ostaje striktno na tom nalazu. U audit-u `24-changes.md` postoje preklapajući nalazi `BA-changes-08` i `BA-changes-13`; oni ostaju otvoreni i neće se statusno zatvarati bez zasebnog acceptancea. Nije planirano istraživanje ili promjena ticket-message/search pragova.
